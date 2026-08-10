import { Router } from "express";
import { z } from "zod";
import {
  addDriverManuallySchema,
  adjustTripCountSchema,
  priorityOrderSchema,
  rejectDriverSchema,
  updateOwnStatusSchema,
  SOCKET_EVENTS,
} from "@acat/shared";
import { prisma } from "../../lib/prisma.js";
import { validateBody } from "../../middleware/validate.js";
import { currentAdmin, currentDriver, requireAuth, requireDriver, requireMaster } from "../../middleware/auth.js";
import { publicDriver } from "../../lib/dto.js";
import { nextCidadeQueueSeq, nextPriorityRank } from "./queueOrder.js";
import { tryAdvanceWaitingCall } from "../cidade/engine.js";
import { emitAdvanceResult } from "../cidade/notify.js";
import { emitToEveryone } from "../../realtime/io.js";
import { pushToAllAdmins } from "../../lib/push.js";

export const driversRouter = Router();
driversRouter.use(requireAuth);

// ---------------------------------------------------------------------------
// Master-only driver management
// ---------------------------------------------------------------------------

driversRouter.get("/", requireMaster, async (_req, res) => {
  const drivers = await prisma.driver.findMany({ orderBy: [{ approvalStatus: "asc" }, { createdAt: "desc" }] });
  res.json({ drivers: drivers.map(publicDriver) });
});

driversRouter.get("/deletion-history", requireMaster, async (_req, res) => {
  const history = await prisma.driverDeletionHistory.findMany({ orderBy: { deletedAt: "desc" } });
  res.json({ history });
});

driversRouter.get("/password-reset-requests", requireMaster, async (_req, res) => {
  const requests = await prisma.passwordResetRequest.findMany({
    where: { status: "pending" },
    include: { driver: true },
    orderBy: { createdAt: "asc" },
  });
  res.json({
    requests: requests.map((r) => ({
      id: r.id,
      createdAt: r.createdAt,
      driver: publicDriver(r.driver),
    })),
  });
});

driversRouter.post("/", requireMaster, validateBody(addDriverManuallySchema), async (req, res) => {
  const { telefone, carro, nome } = req.body as z.infer<typeof addDriverManuallySchema>;

  const [existingPhone, existingCar] = await Promise.all([
    prisma.driver.findUnique({ where: { phone: telefone } }),
    prisma.driver.findUnique({ where: { carNumber: carro } }),
  ]);
  if (existingPhone) {
    res.status(409).json({ error: "Esse telefone já tem um cadastro." });
    return;
  }
  if (existingCar) {
    res.status(409).json({ error: "Já existe um cadastro para esse número de carro." });
    return;
  }

  const [priorityRank, cidadeQueueSeq] = await Promise.all([nextPriorityRank(prisma), nextCidadeQueueSeq(prisma)]);

  const driver = await prisma.driver.create({
    data: {
      carNumber: carro,
      name: nome,
      phone: telefone,
      passwordHash: null,
      mustSetPassword: true,
      approvalStatus: "aprovado",
      priorityRank,
      cidadeQueueSeq,
      createdByAdminId: currentAdmin(req).id,
    },
  });

  res.status(201).json({ driver: publicDriver(driver) });
});

driversRouter.put("/priority-order", requireMaster, validateBody(priorityOrderSchema), async (req, res) => {
  const { driverIds } = req.body as z.infer<typeof priorityOrderSchema>;

  await prisma.$transaction(
    driverIds.map((id, index) => prisma.driver.update({ where: { id }, data: { priorityRank: index + 1 } })),
  );

  const drivers = await prisma.driver.findMany({ orderBy: { priorityRank: "asc" } });
  res.json({ drivers: drivers.map(publicDriver) });
});

driversRouter.post("/trip-count/reset-all", requireMaster, async (_req, res) => {
  await prisma.driver.updateMany({ where: { approvalStatus: "aprovado" }, data: { tripCount: 0 } });
  const drivers = await prisma.driver.findMany({ where: { approvalStatus: "aprovado" } });
  res.json({ drivers: drivers.map(publicDriver) });
});

driversRouter.patch("/:id/approve", requireMaster, async (req, res) => {
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) {
    res.status(404).json({ error: "Motorista não encontrado." });
    return;
  }
  if (driver.approvalStatus !== "pendente") {
    res.status(409).json({ error: "Este cadastro não está mais pendente." });
    return;
  }

  const [priorityRank, cidadeQueueSeq] = await Promise.all([nextPriorityRank(prisma), nextCidadeQueueSeq(prisma)]);
  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: { approvalStatus: "aprovado", rejectionReason: null, priorityRank, cidadeQueueSeq },
  });
  res.json({ driver: publicDriver(updated) });
});

driversRouter.patch("/:id/reject", requireMaster, validateBody(rejectDriverSchema), async (req, res) => {
  const { motivo } = req.body as z.infer<typeof rejectDriverSchema>;
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) {
    res.status(404).json({ error: "Motorista não encontrado." });
    return;
  }
  if (driver.approvalStatus !== "pendente") {
    res.status(409).json({ error: "Este cadastro não está mais pendente." });
    return;
  }

  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: { approvalStatus: "rejeitado", rejectionReason: motivo },
  });
  res.json({ driver: publicDriver(updated) });
});

driversRouter.patch("/:id/block", requireMaster, async (req, res) => {
  const driver = await prisma.driver.update({ where: { id: req.params.id }, data: { blocked: true } });
  res.json({ driver: publicDriver(driver) });
});

driversRouter.patch("/:id/unblock", requireMaster, async (req, res) => {
  const cidadeQueueSeq = await nextCidadeQueueSeq(prisma);
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: { blocked: false, cidadeQueueSeq },
  });
  res.json({ driver: publicDriver(driver) });
});

driversRouter.post("/:id/reset-password", requireMaster, async (req, res) => {
  const driver = await prisma.driver.update({
    where: { id: req.params.id },
    data: { passwordHash: null, mustSetPassword: true },
  });
  await prisma.passwordResetRequest.updateMany({
    where: { driverId: driver.id, status: "pending" },
    data: { status: "resolved", resolvedAt: new Date(), resolvedByAdminId: currentAdmin(req).id },
  });
  res.json({ driver: publicDriver(driver) });
});

driversRouter.patch("/:id/trip-count", requireMaster, validateBody(adjustTripCountSchema), async (req, res) => {
  const { tripCount } = req.body as z.infer<typeof adjustTripCountSchema>;
  const driver = await prisma.driver.update({ where: { id: req.params.id }, data: { tripCount } });
  res.json({ driver: publicDriver(driver) });
});

const deleteDriverSchema = z.object({ motivo: z.string().trim().optional() });

driversRouter.delete("/:id", requireMaster, validateBody(deleteDriverSchema), async (req, res) => {
  const { motivo } = req.body as z.infer<typeof deleteDriverSchema>;
  const driver = await prisma.driver.findUnique({ where: { id: req.params.id } });
  if (!driver) {
    res.status(404).json({ error: "Motorista não encontrado." });
    return;
  }

  await prisma.$transaction([
    prisma.driverDeletionHistory.create({
      data: {
        originalDriverId: driver.id,
        carNumber: driver.carNumber,
        name: driver.name,
        phone: driver.phone,
        tripCount: driver.tripCount,
        reason: motivo,
        deletedByAdminId: currentAdmin(req).id,
      },
    }),
    prisma.driver.delete({ where: { id: driver.id } }),
  ]);

  res.status(204).end();
});

// ---------------------------------------------------------------------------
// Driver self-service
// ---------------------------------------------------------------------------

driversRouter.patch("/me/status", requireDriver, validateBody(updateOwnStatusSchema), async (req, res) => {
  const driver = currentDriver(req);
  if (driver.operationalStatus === "em_viagem") {
    res.status(409).json({ error: 'Você está em viagem. Use "Finalizar corrida" para ficar disponível de novo.' });
    return;
  }

  const { status } = req.body as z.infer<typeof updateOwnStatusSchema>;

  // Deliberately NOT in the same transaction as tryAdvanceWaitingCall below: this update needs to
  // commit on its own first. Two drivers flipping 'disponivel' at the same instant both run this
  // fast, uncontended, independent write immediately, so by the time either of them reaches the
  // call-row lock (which does serialize the two), the queue scan sees BOTH of them as available and
  // picks the correct one by queue order — not just whichever request happened to grab the lock first.
  const updated = await prisma.driver.update({ where: { id: driver.id }, data: { operationalStatus: status } });
  const advance = status === "disponivel" ? await prisma.$transaction((tx) => tryAdvanceWaitingCall(tx)) : null;

  emitToEveryone(SOCKET_EVENTS.driverStatusChanged, { driverId: driver.id, status });
  if (advance) emitAdvanceResult(advance);

  res.json({ driver: publicDriver(updated) });
});

driversRouter.post("/me/finalizar-corrida", requireDriver, async (req, res) => {
  const driver = currentDriver(req);
  if (driver.operationalStatus !== "em_viagem") {
    res.status(409).json({ error: "Você não está em viagem no momento." });
    return;
  }

  const updated = await prisma.driver.update({ where: { id: driver.id }, data: { operationalStatus: "disponivel" } });
  const advance = await prisma.$transaction((tx) => tryAdvanceWaitingCall(tx));

  emitToEveryone(SOCKET_EVENTS.driverStatusChanged, { driverId: driver.id, status: "disponivel" });
  if (advance) emitAdvanceResult(advance);

  res.json({ driver: publicDriver(updated) });
});

driversRouter.post("/me/request-password-reset", requireDriver, async (req, res) => {
  const driver = currentDriver(req);

  const existing = await prisma.passwordResetRequest.findFirst({
    where: { driverId: driver.id, status: "pending" },
  });
  if (existing) {
    res.status(409).json({ error: "Você já tem um pedido de redefinição de senha em aberto." });
    return;
  }

  const request = await prisma.passwordResetRequest.create({ data: { driverId: driver.id } });

  emitToEveryone(SOCKET_EVENTS.adminNotification, {
    kind: "password_reset_request",
    message: `Carro ${driver.carNumber} pediu redefinição de senha.`,
  });
  void pushToAllAdmins({
    title: "Pedido de redefinição de senha",
    body: `Carro ${driver.carNumber} — ${driver.name} pediu para redefinir a senha.`,
    url: "/admin/motoristas",
  });

  res.status(201).json({ request: { id: request.id, createdAt: request.createdAt } });
});
