import { CIDADE_SWEEP_INTERVAL_MS } from "@acat/shared";
import { prisma } from "../../lib/prisma.js";
import { advanceCoturCidadeQueue, sendDriverToBackOfCidadeQueue, type AdvanceResult } from "./engine.js";

/**
 * Runs one sweep tick: server-authoritative expiry check for the Cotur Cidade SLA.
 * Uses a transaction-scoped Postgres advisory lock so overlapping ticks (a slow previous tick still
 * running) skip cleanly instead of racing, and a row lock on the expired call so a concurrent
 * explicit "Recusar" can never be double-processed alongside a timeout.
 */
export async function sweepOnce(): Promise<AdvanceResult | null> {
  return prisma.$transaction(async (tx) => {
    const [lock] = await tx.$queryRaw<{ locked: boolean }[]>`
      SELECT pg_try_advisory_xact_lock(hashtext('cidade_sweep')::bigint) AS locked
    `;
    if (!lock?.locked) return null;

    const [expired] = await tx.$queryRaw<{ id: string; candidateDriverId: string | null }[]>`
      SELECT id, "candidateDriverId" FROM "CoturCidadeCall"
      WHERE status = 'offering' AND "offerExpiresAt" < now()
      LIMIT 1 FOR UPDATE
    `;
    if (!expired) return null;

    if (expired.candidateDriverId) {
      const driver = await tx.driver.findUnique({ where: { id: expired.candidateDriverId } });
      await tx.coturCidadeCallEvent.create({
        data: {
          callId: expired.id,
          type: "timed_out",
          driverId: expired.candidateDriverId,
          carSnap: driver?.carNumber,
          nameSnap: driver?.name,
        },
      });
      await sendDriverToBackOfCidadeQueue(tx, expired.candidateDriverId);
    }

    return advanceCoturCidadeQueue(tx, expired.id, expired.candidateDriverId ?? undefined);
  });
}

export function startCidadeSweep(onResult: (result: AdvanceResult) => void): () => void {
  const interval = setInterval(() => {
    sweepOnce()
      .then((result) => {
        if (result) onResult(result);
      })
      .catch((err) => {
        console.error("[cidade sweep] failed:", err);
      });
  }, CIDADE_SWEEP_INTERVAL_MS);

  return () => clearInterval(interval);
}
