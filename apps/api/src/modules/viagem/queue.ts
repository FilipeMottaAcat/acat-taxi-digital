import type { Prisma, PrismaClient } from "@prisma/client";

type Db = PrismaClient | Prisma.TransactionClient;

/** Cotur Viagem queue order: fewest accumulated trips first, tiebreak by the master-curated priority list. */
export function viagemSortedQueue(db: Db) {
  return db.driver.findMany({
    where: { approvalStatus: "aprovado", blocked: false },
    orderBy: [{ tripCount: "asc" }, { priorityRank: "asc" }],
  });
}
