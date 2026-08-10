import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Next Cotur Viagem tiebreak rank — new drivers join at the back of the priority list. */
export async function nextPriorityRank(db: Db): Promise<number> {
  const result = await db.driver.aggregate({ _max: { priorityRank: true } });
  return (result._max.priorityRank ?? 0) + 1;
}

/** Next Cotur Cidade queue position — new/unblocked drivers join at the back of the queue. */
export async function nextCidadeQueueSeq(db: Db): Promise<bigint> {
  const result = await db.driver.aggregate({ _max: { cidadeQueueSeq: true } });
  return (result._max.cidadeQueueSeq ?? 0n) + 1n;
}
