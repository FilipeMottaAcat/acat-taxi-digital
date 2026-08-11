import type { Prisma } from "@prisma/client";
import { CIDADE_SLA_MINUTES, type CidadeCallType } from "@acat/shared";
import { nextCidadeQueueSeq } from "../drivers/queueOrder.js";

export type AdvanceResult =
  | { type: "offered"; callId: string; driverId: string; carNumber: string; offerExpiresAt: Date }
  | { type: "accepted"; callId: string; driverId: string; carNumber: string; nameSnap: string }
  | { type: "waiting"; callId: string };

/**
 * Finalizes a call as accepted by a driver — the one place that writes an acceptance, used both
 * when a driver explicitly clicks "Aceitar" for their official turn, and when the queue-advance
 * loop below finds they'd already pre-answered "disponivel" before their turn came up.
 *
 * Defaults the driver to indisponivel (a reasonable "just took a ride" default), but this is a
 * plain status change, not a lock — the driver can flip themselves back to disponivel whenever
 * they decide they're free, same as any other status change.
 */
export async function finalizeCidadeAcceptance(tx: Prisma.TransactionClient, callId: string, driverId: string) {
  const cidadeQueueSeq = await nextCidadeQueueSeq(tx);
  const updatedDriver = await tx.driver.update({
    where: { id: driverId },
    data: { operationalStatus: "indisponivel", cidadeQueueSeq },
  });
  const updatedCall = await tx.coturCidadeCall.update({
    where: { id: callId },
    data: {
      status: "concluido",
      candidateDriverId: driverId,
      acceptedDriverId: driverId,
      acceptedCarSnap: updatedDriver.carNumber,
      acceptedNameSnap: updatedDriver.name,
      acceptedAt: new Date(),
    },
  });
  await tx.coturCidadeCallEvent.create({
    data: { callId, type: "accepted", driverId, carSnap: updatedDriver.carNumber, nameSnap: updatedDriver.name },
  });
  return updatedCall;
}

/**
 * The single decision point for "who's next" in Cotur Cidade. Always called inside a transaction
 * that already holds a row lock (`FOR UPDATE`) on the call being advanced, so it's safe to call
 * from the sweep, from an explicit decline, from call creation, or from a driver flipping available.
 *
 * Drivers can pre-answer "disponivel"/"indisponivel" for a call before it's officially their turn
 * (see CoturCidadeCallResponse) — every candidate this loop considers is checked against that table
 * first, so a driver who already told us "not interested" is skipped without opening a fresh SLA
 * window for them, and a driver who already said "I'll take it" is assigned immediately instead of
 * waiting out a timer we don't need. Only a candidate with no pre-answer gets the traditional
 * offer-and-wait treatment.
 *
 * `excludeDriverId` seeds the initial skip set — used by the decline/timeout paths so the driver who
 * just gave up the call isn't immediately re-offered the very same call just because they're still
 * the only (or highest-priority) `disponivel` driver — they keep their `disponivel` status, but this
 * particular call has to look past them once.
 */
export async function advanceCoturCidadeQueue(
  tx: Prisma.TransactionClient,
  callId: string,
  excludeDriverId?: string,
): Promise<AdvanceResult> {
  const call = await tx.coturCidadeCall.findUniqueOrThrow({ where: { id: callId } });
  const excluded = new Set<string>(excludeDriverId ? [excludeDriverId] : []);

  for (;;) {
    const candidate = await tx.driver.findFirst({
      where: {
        approvalStatus: "aprovado",
        blocked: false,
        operationalStatus: "disponivel",
        ...(excluded.size ? { id: { notIn: [...excluded] } } : {}),
      },
      orderBy: { cidadeQueueSeq: "asc" },
    });

    if (!candidate) {
      await tx.coturCidadeCall.update({
        where: { id: callId },
        data: { status: "waiting_for_available", candidateDriverId: null, offerExpiresAt: null },
      });
      await tx.coturCidadeCallEvent.create({ data: { callId, type: "entered_waiting" } });
      return { type: "waiting", callId };
    }

    const preAnswer = await tx.coturCidadeCallResponse.findUnique({
      where: { callId_driverId: { callId, driverId: candidate.id } },
    });

    if (preAnswer?.response === "indisponivel") {
      await sendDriverToBackOfCidadeQueue(tx, candidate.id);
      await tx.coturCidadeCallEvent.create({
        data: { callId, type: "declined", driverId: candidate.id, carSnap: candidate.carNumber, nameSnap: candidate.name },
      });
      excluded.add(candidate.id);
      continue;
    }

    if (preAnswer?.response === "disponivel") {
      const updatedCall = await finalizeCidadeAcceptance(tx, callId, candidate.id);
      return {
        type: "accepted",
        callId,
        driverId: candidate.id,
        carNumber: updatedCall.acceptedCarSnap!,
        nameSnap: updatedCall.acceptedNameSnap!,
      };
    }

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
