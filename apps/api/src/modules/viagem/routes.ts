import { Router } from "express";
import { z } from "zod";
import { createViagemRequestSchema } from "@acat/shared";
import { SOCKET_EVENTS } from "@acat/shared";
import { prisma } from "../../lib/prisma.js";
import { validateBody } from "../../middleware/validate.js";
import { currentAdmin, currentDriver, requireAdmin, requireAuth, requireDriver, requireMaster } from "../../middleware/auth.js";
import { publicDriver, publicViagemCall } from "../../lib/dto.js";
import { isFutureOrNow } from "../../lib/datetime.js";
import { emitToEveryone } from "../../realtime/io.js";
import { viagemSortedQueue } from "./queue.js";

export const viagemRouter = Router();
viagemRouter.use(requireAuth);

viagemRouter.get("/queue", async (_req, res) => {
  const queue = await viagemSortedQueue(prisma);
  res.json({ queue: queue.map(publicDriver) });
});

viagemRouter.get("/current", async (_req, res) => {
  const call = await prisma.coturViagemCall.findFirst({ where: { status: "aberto" } });
  if (!call) {
    res.json({ call: null, nextDriver: null });
    return;
  }
  const queue = await viagemSortedQueue(prisma);
  const nextDriver = queue[0] ?? null;
  res.json({ call: publicViagemCall(call), nextDriver: nextDriver ? publicDriver(nextDriver) : null });
});

viagemRouter.get("/history", requireAdmin, async (req, res) => {
  const admin = currentAdmin(req);
  const statusFilter: ("concluido" | "cancelado")[] = ["concluido", "cancelado"];
  const where =
    admin.role === "admin_master"
      ? { status: { in: statusFilter } }
      : { status: { in: statusFilter }, createdByAdminId: admin.id };

  const calls = await prisma.coturViagemCall.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ calls: calls.map(publicViagemCall) });
});

viagemRouter.post("/requests", requireAdmin, validateBody(createViagemRequestSchema), async (req, res) => {
  const { data, cidade, horario } = req.body as z.infer<typeof createViagemRequestSchema>;

  if (!isFutureOrNow(data, horario)) {
    res.status(400).json({ error: "Não é possível criar uma solicitação com data ou horário no passado." });
    return;
  }

  const existingOpen = await prisma.coturViagemCall.findFirst({ where: { status: "aberto" } });
  if (existingOpen) {
    res.status(409).json({ error: "Já existe uma solicitação de viagem em aberto." });
    return;
  }

  const queue = await viagemSortedQueue(prisma);
  if (queue.length === 0) {
    res.status(400).json({ error: "Nenhum motorista disponível no Cotur Viagem." });
    return;
  }

  const call = await prisma.coturViagemCall.create({
    data: { tripDate: data, city: cidade, time: horario, createdByAdminId: currentAdmin(req).id },
  });

  emitToEveryone(SOCKET_EVENTS.viagemRequestCreated, { callId: call.id });

  res.status(201).json({ call: publicViagemCall(call), nextDriver: publicDriver(queue[0]) });
});

viagemRouter.post("/requests/:id/aceitar", requireDriver, async (req, res) => {
  const driver = currentDriver(req);

  const result = await prisma.$transaction(async (tx) => {
    const [call] = await tx.$queryRaw<{ id: string; status: string }[]>`
      SELECT id, status FROM "CoturViagemCall" WHERE id = ${req.params.id} FOR UPDATE
    `;
    if (!call || call.status !== "aberto") return { error: 404 as const };

    const queue = await viagemSortedQueue(tx);
    const head = queue[0];
    if (!head || head.id !== driver.id) return { error: 403 as const };

    const updatedDriver = await tx.driver.update({
      where: { id: driver.id },
      data: { tripCount: { increment: 1 } },
    });
    const updatedCall = await tx.coturViagemCall.update({
      where: { id: req.params.id },
      data: {
        status: "concluido",
        acceptedDriverId: driver.id,
        acceptedCarSnap: updatedDriver.carNumber,
        acceptedNameSnap: updatedDriver.name,
        acceptedAt: new Date(),
      },
    });
    return { call: updatedCall };
  });

  if ("error" in result) {
    if (result.error === 404) {
      res.status(404).json({ error: "Solicitação não encontrada ou já encerrada." });
    } else {
      res.status(403).json({ error: "Não é a sua vez nessa fila." });
    }
    return;
  }

  emitToEveryone(SOCKET_EVENTS.viagemRequestClosed, { callId: result.call.id });
  emitToEveryone(SOCKET_EVENTS.viagemQueueUpdated, {});

  res.json({ call: publicViagemCall(result.call) });
});

viagemRouter.post("/requests/:id/cancelar", requireMaster, async (req, res) => {
  const call = await prisma.coturViagemCall.findUnique({ where: { id: req.params.id } });
  if (!call || call.status !== "aberto") {
    res.status(404).json({ error: "Solicitação não encontrada ou já encerrada." });
    return;
  }

  const updated = await prisma.coturViagemCall.update({
    where: { id: call.id },
    data: { status: "cancelado", cancelledAt: new Date() },
  });

  emitToEveryone(SOCKET_EVENTS.viagemRequestClosed, { callId: updated.id });

  res.json({ call: publicViagemCall(updated) });
});
