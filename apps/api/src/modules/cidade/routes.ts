import { Router } from "express";
import { z } from "zod";
import type { CoturCidadeCall } from "@prisma/client";
import { createCidadeCallSchema, SOCKET_EVENTS } from "@acat/shared";
import { prisma } from "../../lib/prisma.js";
import { validateBody } from "../../middleware/validate.js";
import { currentAdmin, currentDriver, requireAdmin, requireAuth, requireDriver, requireMaster } from "../../middleware/auth.js";
import { publicCidadeCall, publicCidadeEvent, publicDriver } from "../../lib/dto.js";
import { isFutureOrNow } from "../../lib/datetime.js";
import { emitToEveryone } from "../../realtime/io.js";
import { advanceCoturCidadeQueue, lockCall, sendDriverToBackOfCidadeQueue, type AdvanceResult } from "./engine.js";
import { emitAdvanceResult } from "./notify.js";
import { cidadeSortedQueue } from "./queue.js";
import { nextCidadeQueueSeq } from "../drivers/queueOrder.js";

export const cidadeRouter = Router();
cidadeRouter.use(requireAuth);

const ACTIVE_STATUSES = ["offering", "waiting_for_available"] as const;

cidadeRouter.get("/queue", async (_req, res) => {
  const queue = await cidadeSortedQueue(prisma);
  res.json({ queue: queue.map(publicDriver) });
});

cidadeRouter.get("/current", async (_req, res) => {
  const call = await prisma.coturCidadeCall.findFirst({ where: { status: { in: [...ACTIVE_STATUSES] } } });
  if (!call) {
    res.json({ call: null, candidate: null });
    return;
  }
  const candidate = call.candidateDriverId
    ? await prisma.driver.findUnique({ where: { id: call.candidateDriverId } })
    : null;
  res.json({ call: publicCidadeCall(call), candidate: candidate ? publicDriver(candidate) : null });
});

cidadeRouter.get("/calls/:id/events", requireMaster, async (req, res) => {
  const events = await prisma.coturCidadeCallEvent.findMany({
    where: { callId: req.params.id },
    orderBy: { createdAt: "asc" },
  });
  res.json({ events: events.map(publicCidadeEvent) });
});

cidadeRouter.get("/history", requireAdmin, async (req, res) => {
  const admin = currentAdmin(req);
  const statusFilter: ("concluido" | "cancelado")[] = ["concluido", "cancelado"];
  const where =
    admin.role === "admin_master"
      ? { status: { in: statusFilter } }
      : { status: { in: statusFilter }, createdByAdminId: admin.id };

  const calls = await prisma.coturCidadeCall.findMany({ where, orderBy: { createdAt: "desc" }, take: 100 });
  res.json({ calls: calls.map(publicCidadeCall) });
});

cidadeRouter.post("/calls", requireAdmin, validateBody(createCidadeCallSchema), async (req, res) => {
  const { data, cidade, horario, type } = req.body as z.infer<typeof createCidadeCallSchema>;

  if (!isFutureOrNow(data, horario)) {
    res.status(400).json({ error: "Não é possível criar uma chamada com data ou horário no passado." });
    return;
  }

  const existingActive = await prisma.coturCidadeCall.findFirst({ where: { status: { in: [...ACTIVE_STATUSES] } } });
  if (existingActive) {
    res.status(409).json({ error: "Já existe uma chamada de Cotur Cidade em aberto." });
    return;
  }

  const adminId = currentAdmin(req).id;

  const { call, result } = await prisma.$transaction(async (tx) => {
    const created = await tx.coturCidadeCall.create({
      data: { type, tripDate: data, city: cidade, time: horario, createdByAdminId: adminId },
    });
    const advance = await advanceCoturCidadeQueue(tx, created.id);
    const fresh = await tx.coturCidadeCall.findUniqueOrThrow({ where: { id: created.id } });
    return { call: fresh, result: advance };
  });

  emitToEveryone(SOCKET_EVENTS.cidadeCallCreated, { callId: call.id });
  emitAdvanceResult(result);

  res.status(201).json({ call: publicCidadeCall(call) });
});

cidadeRouter.post("/calls/:id/aceitar", requireDriver, async (req, res) => {
  const driver = currentDriver(req);

  const outcome = await prisma.$transaction<{ error: 404 | 403 } | { call: CoturCidadeCall }>(async (tx) => {
    const call = await lockCall(tx, req.params.id);
    if (!call || call.status !== "offering") return { error: 404 };
    if (call.candidateDriverId !== driver.id) return { error: 403 };

    const cidadeQueueSeq = await nextCidadeQueueSeq(tx);
    const updatedDriver = await tx.driver.update({
      where: { id: driver.id },
      data: { operationalStatus: "em_viagem", cidadeQueueSeq },
    });
    const updatedCall = await tx.coturCidadeCall.update({
      where: { id: call.id },
      data: {
        status: "concluido",
        acceptedDriverId: driver.id,
        acceptedCarSnap: updatedDriver.carNumber,
        acceptedNameSnap: updatedDriver.name,
        acceptedAt: new Date(),
      },
    });
    await tx.coturCidadeCallEvent.create({
      data: { callId: call.id, type: "accepted", driverId: driver.id, carSnap: updatedDriver.carNumber, nameSnap: updatedDriver.name },
    });
    return { call: updatedCall };
  });

  if ("error" in outcome) {
    res.status(outcome.error).json({ error: outcome.error === 404 ? "Chamada não encontrada ou já encerrada." : "Não é a sua vez nessa chamada." });
    return;
  }

  emitToEveryone(SOCKET_EVENTS.cidadeAccepted, { callId: outcome.call.id });
  emitToEveryone(SOCKET_EVENTS.driverStatusChanged, { driverId: driver.id, status: "em_viagem" });

  res.json({ call: publicCidadeCall(outcome.call) });
});

cidadeRouter.post("/calls/:id/recusar", requireDriver, async (req, res) => {
  const driver = currentDriver(req);

  const outcome = await prisma.$transaction<{ error: 404 | 403 } | { result: AdvanceResult }>(async (tx) => {
    const call = await lockCall(tx, req.params.id);
    if (!call || call.status !== "offering") return { error: 404 };
    if (call.candidateDriverId !== driver.id) return { error: 403 };

    await tx.coturCidadeCallEvent.create({
      data: { callId: call.id, type: "declined", driverId: driver.id, carSnap: driver.carNumber, nameSnap: driver.name },
    });
    await sendDriverToBackOfCidadeQueue(tx, driver.id);
    const result = await advanceCoturCidadeQueue(tx, call.id, driver.id);
    return { result };
  });

  if ("error" in outcome) {
    res.status(outcome.error).json({ error: outcome.error === 404 ? "Chamada não encontrada ou já encerrada." : "Não é a sua vez nessa chamada." });
    return;
  }

  emitToEveryone(SOCKET_EVENTS.cidadeDeclined, { callId: req.params.id });
  emitAdvanceResult(outcome.result);

  res.status(204).end();
});

cidadeRouter.post("/calls/:id/cancelar", requireMaster, async (req, res) => {
  const call = await prisma.coturCidadeCall.findUnique({ where: { id: req.params.id } });
  if (!call || !ACTIVE_STATUSES.includes(call.status as (typeof ACTIVE_STATUSES)[number])) {
    res.status(404).json({ error: "Chamada não encontrada ou já encerrada." });
    return;
  }

  const updated = await prisma.$transaction(async (tx) => {
    const result = await tx.coturCidadeCall.update({
      where: { id: call.id },
      data: { status: "cancelado", cancelledByAdminId: currentAdmin(req).id, cancelledAt: new Date() },
    });
    await tx.coturCidadeCallEvent.create({ data: { callId: call.id, type: "cancelled" } });
    return result;
  });

  emitToEveryone(SOCKET_EVENTS.cidadeCancelled, { callId: updated.id });

  res.json({ call: publicCidadeCall(updated) });
});
