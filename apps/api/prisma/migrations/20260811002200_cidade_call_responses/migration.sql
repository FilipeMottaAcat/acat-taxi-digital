-- CreateEnum
CREATE TYPE "CidadeResponseType" AS ENUM ('disponivel', 'indisponivel');

-- CreateTable
CREATE TABLE "CoturCidadeCallResponse" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "response" "CidadeResponseType" NOT NULL,
    "createdAt" TIMESTAMPTZ NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMPTZ NOT NULL,

    CONSTRAINT "CoturCidadeCallResponse_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CoturCidadeCallResponse_callId_idx" ON "CoturCidadeCallResponse"("callId");

-- CreateIndex
CREATE UNIQUE INDEX "CoturCidadeCallResponse_callId_driverId_key" ON "CoturCidadeCallResponse"("callId", "driverId");

-- AddForeignKey
ALTER TABLE "CoturCidadeCallResponse" ADD CONSTRAINT "CoturCidadeCallResponse_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CoturCidadeCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoturCidadeCallResponse" ADD CONSTRAINT "CoturCidadeCallResponse_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE CASCADE ON UPDATE CASCADE;
