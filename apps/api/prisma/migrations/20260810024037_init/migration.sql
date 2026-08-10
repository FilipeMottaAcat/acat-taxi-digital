-- CreateEnum
CREATE TYPE "AdminRole" AS ENUM ('admin_master', 'admin_comum');

-- CreateEnum
CREATE TYPE "ApprovalStatus" AS ENUM ('pendente', 'aprovado', 'rejeitado');

-- CreateEnum
CREATE TYPE "OperationalStatus" AS ENUM ('disponivel', 'indisponivel', 'em_viagem');

-- CreateEnum
CREATE TYPE "ViagemCallStatus" AS ENUM ('aberto', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "CidadeCallType" AS ENUM ('agendada', 'momento');

-- CreateEnum
CREATE TYPE "CidadeCallStatus" AS ENUM ('offering', 'waiting_for_available', 'concluido', 'cancelado');

-- CreateEnum
CREATE TYPE "CidadeEventType" AS ENUM ('offered', 'accepted', 'declined', 'timed_out', 'entered_waiting', 'cancelled');

-- CreateTable
CREATE TABLE "Admin" (
    "id" TEXT NOT NULL,
    "nome" TEXT NOT NULL,
    "usuario" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "role" "AdminRole" NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Admin_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Driver" (
    "id" TEXT NOT NULL,
    "carNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "passwordHash" TEXT,
    "mustSetPassword" BOOLEAN NOT NULL DEFAULT true,
    "approvalStatus" "ApprovalStatus" NOT NULL DEFAULT 'pendente',
    "rejectionReason" TEXT,
    "blocked" BOOLEAN NOT NULL DEFAULT false,
    "operationalStatus" "OperationalStatus" NOT NULL DEFAULT 'indisponivel',
    "tripCount" INTEGER NOT NULL DEFAULT 0,
    "priorityRank" INTEGER NOT NULL DEFAULT 0,
    "cidadeQueueSeq" BIGINT NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdByAdminId" TEXT,

    CONSTRAINT "Driver_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DriverDeletionHistory" (
    "id" TEXT NOT NULL,
    "originalDriverId" TEXT NOT NULL,
    "carNumber" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "tripCount" INTEGER NOT NULL,
    "reason" TEXT,
    "deletedByAdminId" TEXT NOT NULL,
    "deletedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "DriverDeletionHistory_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PasswordResetRequest" (
    "id" TEXT NOT NULL,
    "driverId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'pending',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "resolvedAt" TIMESTAMP(3),
    "resolvedByAdminId" TEXT,

    CONSTRAINT "PasswordResetRequest_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userType" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoturViagemCall" (
    "id" TEXT NOT NULL,
    "status" "ViagemCallStatus" NOT NULL DEFAULT 'aberto',
    "tripDate" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedDriverId" TEXT,
    "acceptedCarSnap" TEXT,
    "acceptedNameSnap" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "CoturViagemCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoturCidadeCall" (
    "id" TEXT NOT NULL,
    "type" "CidadeCallType" NOT NULL,
    "tripDate" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "time" TEXT NOT NULL,
    "status" "CidadeCallStatus" NOT NULL DEFAULT 'offering',
    "candidateDriverId" TEXT,
    "offerExpiresAt" TIMESTAMP(3),
    "createdByAdminId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "acceptedDriverId" TEXT,
    "acceptedCarSnap" TEXT,
    "acceptedNameSnap" TEXT,
    "acceptedAt" TIMESTAMP(3),
    "cancelledByAdminId" TEXT,
    "cancelledAt" TIMESTAMP(3),

    CONSTRAINT "CoturCidadeCall_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CoturCidadeCallEvent" (
    "id" TEXT NOT NULL,
    "callId" TEXT NOT NULL,
    "type" "CidadeEventType" NOT NULL,
    "driverId" TEXT,
    "carSnap" TEXT,
    "nameSnap" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CoturCidadeCallEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Admin_usuario_key" ON "Admin"("usuario");

-- CreateIndex
CREATE INDEX "Admin_active_idx" ON "Admin"("active");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_carNumber_key" ON "Driver"("carNumber");

-- CreateIndex
CREATE UNIQUE INDEX "Driver_phone_key" ON "Driver"("phone");

-- CreateIndex
CREATE INDEX "Driver_approvalStatus_blocked_operationalStatus_idx" ON "Driver"("approvalStatus", "blocked", "operationalStatus");

-- CreateIndex
CREATE INDEX "Driver_cidadeQueueSeq_idx" ON "Driver"("cidadeQueueSeq");

-- CreateIndex
CREATE INDEX "Driver_priorityRank_idx" ON "Driver"("priorityRank");

-- CreateIndex
CREATE INDEX "PasswordResetRequest_status_idx" ON "PasswordResetRequest"("status");

-- CreateIndex
CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

-- CreateIndex
CREATE INDEX "PushSubscription_userType_userId_idx" ON "PushSubscription"("userType", "userId");

-- CreateIndex
CREATE INDEX "CoturViagemCall_status_idx" ON "CoturViagemCall"("status");

-- CreateIndex
CREATE INDEX "CoturCidadeCall_status_idx" ON "CoturCidadeCall"("status");

-- CreateIndex
CREATE INDEX "CoturCidadeCallEvent_callId_idx" ON "CoturCidadeCallEvent"("callId");

-- AddForeignKey
ALTER TABLE "Driver" ADD CONSTRAINT "Driver_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DriverDeletionHistory" ADD CONSTRAINT "DriverDeletionHistory_deletedByAdminId_fkey" FOREIGN KEY ("deletedByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "PasswordResetRequest" ADD CONSTRAINT "PasswordResetRequest_resolvedByAdminId_fkey" FOREIGN KEY ("resolvedByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoturViagemCall" ADD CONSTRAINT "CoturViagemCall_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoturViagemCall" ADD CONSTRAINT "CoturViagemCall_acceptedDriverId_fkey" FOREIGN KEY ("acceptedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoturCidadeCall" ADD CONSTRAINT "CoturCidadeCall_candidateDriverId_fkey" FOREIGN KEY ("candidateDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoturCidadeCall" ADD CONSTRAINT "CoturCidadeCall_createdByAdminId_fkey" FOREIGN KEY ("createdByAdminId") REFERENCES "Admin"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoturCidadeCall" ADD CONSTRAINT "CoturCidadeCall_acceptedDriverId_fkey" FOREIGN KEY ("acceptedDriverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoturCidadeCall" ADD CONSTRAINT "CoturCidadeCall_cancelledByAdminId_fkey" FOREIGN KEY ("cancelledByAdminId") REFERENCES "Admin"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoturCidadeCallEvent" ADD CONSTRAINT "CoturCidadeCallEvent_callId_fkey" FOREIGN KEY ("callId") REFERENCES "CoturCidadeCall"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CoturCidadeCallEvent" ADD CONSTRAINT "CoturCidadeCallEvent_driverId_fkey" FOREIGN KEY ("driverId") REFERENCES "Driver"("id") ON DELETE SET NULL ON UPDATE CASCADE;
