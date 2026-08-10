import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Cotur Cidade queue order — round robin by position, independent of Cotur Viagem's trip-count order. */
export function cidadeSortedQueue(db: Db) {
  return db.driver.findMany({
    where: { approvalStatus: "aprovado", blocked: false },
    orderBy: { cidadeQueueSeq: "asc" },
  });
}
