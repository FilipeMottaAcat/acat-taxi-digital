import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";

const prisma = new PrismaClient();

/** Demo data for local development only — mirrors the real 8-car example the client gave us. */
const DEMO_DRIVERS = [
  { carNumber: "543", name: "Antonio Ferreira", phone: "(13) 99111-0001", tripCount: 6, priorityRank: 1 },
  { carNumber: "519", name: "Bruno Souza", phone: "(13) 99111-0002", tripCount: 6, priorityRank: 2 },
  { carNumber: "529", name: "Carlos Lima", phone: "(13) 99111-0003", tripCount: 6, priorityRank: 3 },
  { carNumber: "644", name: "Daniel Alves", phone: "(13) 99111-0004", tripCount: 6, priorityRank: 4 },
  { carNumber: "604", name: "Eduardo Santos", phone: "(13) 99111-0005", tripCount: 5, priorityRank: 5 },
  { carNumber: "523", name: "Fabio Costa", phone: "(13) 99111-0006", tripCount: 5, priorityRank: 6 },
  { carNumber: "575", name: "Gustavo Pereira", phone: "(13) 99111-0007", tripCount: 5, priorityRank: 7 },
  { carNumber: "568", name: "Hugo Martins", phone: "(13) 99111-0008", tripCount: 5, priorityRank: 8 },
];

async function main() {
  const passwordHash = await bcrypt.hash("senha123", 10);

  const master = await prisma.admin.upsert({
    where: { usuario: "master" },
    update: {},
    create: {
      nome: "Administrador Master",
      usuario: "master",
      passwordHash,
      role: "admin_master",
    },
  });

  for (const [i, d] of DEMO_DRIVERS.entries()) {
    await prisma.driver.upsert({
      where: { carNumber: d.carNumber },
      update: {},
      create: {
        carNumber: d.carNumber,
        name: d.name,
        phone: d.phone,
        passwordHash,
        mustSetPassword: false,
        approvalStatus: "aprovado",
        operationalStatus: "indisponivel",
        tripCount: d.tripCount,
        priorityRank: d.priorityRank,
        cidadeQueueSeq: BigInt(i + 1),
        createdByAdminId: master.id,
      },
    });
  }

  console.log("Seed concluído. Login master: usuario=master senha=senha123 (mude em produção).");
}

main()
  .catch((err) => {
    console.error(err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
