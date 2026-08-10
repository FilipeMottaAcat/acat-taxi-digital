import type { Prisma } from "@prisma/client";
import { CIDADE_SLA_MINUTES, type CidadeCallType } from "@acat/shared";
import { nextCidadeQueueSeq } from "../drivers/queueOrder.js";

export type AdvanceResult =
  | { type: "offered"; callId: string; driverId: string; carNumber: string; offerExpiresAt: Date }
  | { type: "waiting"; callId: string };

/**
 * The single decision point for "who's next" in Cotur Cidade. Always called inside a transaction
 * that already holds a row lock (`FOR UPDATE`) on the call being advanced, so it's safe to call
 * from the sweep, from an explicit decline, from call creation, or from a driver flipping available.
 *
 * `excludeDriverId` is used by the decline/timeout paths so the driver who just gave up the call
 * isn't immediately re-offered the very same call on this cascade step just because they're still
 * the only (or highest-priority) `disponivel` driver — they keep their `disponivel` status, but this
 * particular call has to look past them once.
 */
export async function advanceCoturCidadeQueue(
  tx: Prisma.TransactionClient,
  callId: string,
  excludeDriverId?: string,
): Promise<AdvanceResult> {
  const call = await tx.coturCidadeCall.findUniqueOrThrow({ where: { id: callId } });

  const candidate = await tx.driver.findFirst({
    where: {
      approvalStatus: "aprovado",
      blocked: false,
      operationalStatus: "disponivel",
      ...(excludeDriverId ? { id: { not: excludeDriverId } } : {}),
    },
    orderBy: { cidadeQueueSeq: "asc" },
  });

  if (candidate) {
    const slaMinutes = CIDADE_SLA_MINUTES[call.type as CidadeCallType];
    const offerExpiresAt = new Date(Date.now() + slaMinutes * 60_000);

    await tx.coturCidadeCall.update({
      where: { id: callId },
      data: { status: "offering", candidateDriverId: candidate.id, offerExpiresAt },
    });
    await tx.coturCidadeCallEvent.create({
      data: { callId, type: "offered", driverId: candidate.id, carSnap: candidate.carNumber, nameSnap: candidate.name },
    });

    return { type: "offered", callId, driverId: candidate.id, carNumber: candidate.carNumber, offerExpiresAt };
  }

  await tx.coturCidadeCall.update({
    where: { id: callId },
    data: { status: "waiting_for_available", candidateDriverId: null, offerExpiresAt: null },
  });
  await tx.coturCidadeCallEvent.create({ data: { callId, type: "entered_waiting" } });

  return { type: "waiting", callId };
}

/** Locks the call row for update within the current transaction — call before reading/mutating it. */
export async function lockCall(tx: Prisma.TransactionClient, id: string) {
  await tx.$queryRaw`SELECT id FROM "CoturCidadeCall" WHERE id = ${id} FOR UPDATE`;
  return tx.coturCidadeCall.findUnique({ where: { id } });
}

/** Bumps a driver to the back of the Cotur Cidade queue (used on decline, timeout, and unblock). */
export async function sendDriverToBackOfCidadeQueue(tx: Prisma.TransactionClient, driverId: string) {
  const cidadeQueueSeq = await nextCidadeQueueSeq(tx);
  await tx.driver.update({ where: { id: driverId }, data: { cidadeQueueSeq } });
}

/**
 * If there's a call currently waiting for someone to become available, try to advance it.
 * Called right after a driver flips their own status to 'disponivel'. Locks the call first so it
 * can't race the sweep or another driver's status flip.
 */
export async function tryAdvanceWaitingCall(tx: Prisma.TransactionClient): Promise<AdvanceResult | null> {
  const [waiting] = await tx.$queryRaw<{ id: string }[]>`
    SELECT id FROM "CoturCidadeCall" WHERE status = 'waiting_for_available' FOR UPDATE
  `;
  if (!waiting) return null;
  return advanceCoturCidadeQueue(tx, waiting.id);
}
