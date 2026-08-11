import { Router } from "express";
import { z } from "zod";
import { createCidadeCallSchema, respondCidadeCallSchema, SOCKET_EVENTS } from "@acat/shared";
import { prisma } from "../../lib/prisma.js";
import { validateBody } from "../../middleware/validate.js";
import { currentAdmin, currentDriver, requireAdmin, requireAuth, requireDriver, requireMaster } from "../../middleware/auth.js";
import { publicCidadeCall, publicCidadeEvent, publicCidadeResponse, publicDriver } from "../../lib/dto.js";
import { isFutureOrNow } from "../../lib/datetime.js";
import { emitToEveryone } from "../../realtime/io.js";
import { pushToAllDrivers } from "../../lib/push.js";
import { advanceCoturCidadeQueue, finalizeCidadeAcceptance, lockCall, sendDriverToBackOfCidadeQueue, type AdvanceResult } from "./engine.js";
import { emitAdvanceResult } from "./notify.js";
import { cidadeSortedQueue } from "./queue.js";

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
    res.json({ call: null, candidate: null, responses: [] });
    return;
  }
  const [candidate, responses] = await Promise.all([
    call.candidateDriverId ? prisma.driver.findUnique({ where: { id: call.candidateDriverId } }) : null,
    prisma.coturCidadeCallResponse.findMany({ where: { callId: call.id } }),
  ]);
  res.json({
    call: publicCidadeCall(call),
    candidate: candidate ? publicDriver(candidate) : null,
    responses: responses.map(publicCidadeResponse),
  });
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

  // Every registered driver gets paged the moment a call is dispatched — not just whoever's
  // officially "up" — so anyone can pre-answer disponível/indisponível ahead of their turn.
  void pushToAllDrivers({
    title: "Nova corrida — Cotur Cidade",
    body: `Corrida despachada para ${cidade}. Confira se você está disponível.`,
    url: "/driver/cidade",
  });

  res.status(201).json({ call: publicCidadeCall(call) });
});

cidadeRouter.post("/calls/:id/responder", requireDriver, validateBody(respondCidadeCallSchema), async (req, res) => {
  const driver = currentDriver(req);
  const { resposta } = req.body as z.infer<typeof respondCidadeCallSchema>;

  const call = await prisma.coturCidadeCall.findUnique({ where: { id: req.params.id } });
  if (!call || !ACTIVE_STATUSES.includes(call.status as (typeof ACTIVE_STATUSES)[number])) {
    res.status(404).json({ error: "Chamada não encontrada ou já encerrada." });
    return;
  }
  if (call.status === "offering" && call.candidateDriverId === driver.id) {
    res.status(409).json({ error: "É a sua vez nessa chamada — use Aceitar ou Recusar." });
    return;
  }

  const response = await prisma.coturCidadeCallResponse.upsert({
    where: { callId_driverId: { callId: call.id, driverId: driver.id } },
    create: { callId: call.id, driverId: driver.id, response: resposta },
    update: { response: resposta },
  });

  emitToEveryone(SOCKET_EVENTS.cidadeResponseUpdated, { callId: call.id, driverId: driver.id, response: resposta });

  res.json({ response: publicCidadeResponse(response) });
});

cidadeRouter.post("/calls/:id/aceitar", requireDriver, async (req, res) => {
  const driver = currentDriver(req);

  const outcome = await prisma.$transaction<{ error: 404 | 403 } | { call: Awaited<ReturnType<typeof finalizeCidadeAcceptance>> }>(async (tx) => {
    const call = await lockCall(tx, req.params.id);
    if (!call || call.status !== "offering") return { error: 404 };
    if (call.candidateDriverId !== driver.id) return { error: 403 };

    const updatedCall = await finalizeCidadeAcceptance(tx, call.id, driver.id);
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
