import { beforeEach } from "vitest";

process.env.DATABASE_URL =
  "postgresql://postgres:acat_dev_local_2026@localhost:5432/acat_taxi_test?schema=public";
process.env.SESSION_SECRET = "test-secret-not-for-prod-0123456789abcdef";
process.env.NODE_ENV = "test";

beforeEach(async () => {
  const { prisma } = await import("../src/lib/prisma.js");
  await prisma.coturCidadeCallResponse.deleteMany();
  await prisma.coturCidadeCallEvent.deleteMany();
  await prisma.coturCidadeCall.deleteMany();
  await prisma.coturViagemCall.deleteMany();
  await prisma.passwordResetRequest.deleteMany();
  await prisma.pushSubscription.deleteMany();
  await prisma.driverDeletionHistory.deleteMany();
  await prisma.driver.deleteMany();
  await prisma.admin.deleteMany();
});
