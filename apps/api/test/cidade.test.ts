import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";
import { sweepOnce } from "../src/modules/cidade/sweep.js";

const app = createApp();

async function loginAsMaster() {
  await prisma.admin.create({
    data: { nome: "Ana", usuario: "ana", passwordHash: await hashPassword("senha123"), role: "admin_master" },
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/admin/login").send({ usuario: "ana", senha: "senha123" });
  return agent;
}

async function loginAsComum() {
  await prisma.admin.create({
    data: { nome: "Beto", usuario: "beto", passwordHash: await hashPassword("senha123"), role: "admin_comum" },
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/admin/login").send({ usuario: "beto", senha: "senha123" });
  return agent;
}

async function makeDriver(overrides: {
  carNumber: string;
  phone: string;
  cidadeQueueSeq?: number;
  operationalStatus?: "disponivel" | "indisponivel";
}) {
  const driver = await prisma.driver.create({
    data: {
      carNumber: overrides.carNumber,
      name: `Motorista ${overrides.carNumber}`,
      phone: overrides.phone,
      passwordHash: await hashPassword("senha123"),
      mustSetPassword: false,
      approvalStatus: "aprovado",
      cidadeQueueSeq: BigInt(overrides.cidadeQueueSeq ?? 0),
      operationalStatus: overrides.operationalStatus ?? "disponivel",
    },
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/driver/login").send({ telefone: driver.phone, senha: "senha123" });
  return { agent, driver };
}

function futureDate() {
  return new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
}

async function createCall(admin: ReturnType<typeof request.agent>, type: "agendada" | "momento" = "momento") {
  return admin.post("/api/cidade/calls").send({ data: futureDate(), cidade: "Santos", horario: "10:00", type });
}

describe("engine: creating a call offers to the first available driver by queue order", () => {
  it("offers to the lowest cidadeQueueSeq among disponivel drivers", async () => {
    await makeDriver({ carNumber: "519", phone: "(13) 90002-0001", cidadeQueueSeq: 2 });
    const { driver: first } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0002", cidadeQueueSeq: 1 });
    const master = await loginAsMaster();

    const res = await createCall(master);
    expect(res.status).toBe(201);
    expect(res.body.call.status).toBe("offering");
    expect(res.body.call.candidateDriverId).toBe(first.id);
    expect(new Date(res.body.call.offerExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("uses a 10-minute SLA for momento and 30-minute for agendada", async () => {
    await makeDriver({ carNumber: "543", phone: "(13) 90002-0003" });
    const master = await loginAsMaster();

    const momento = await createCall(master, "momento");
    const expiresMomento = new Date(momento.body.call.offerExpiresAt).getTime();
    expect(expiresMomento - Date.now()).toBeGreaterThan(9 * 60_000);
    expect(expiresMomento - Date.now()).toBeLessThan(11 * 60_000);

    await master.post(`/api/cidade/calls/${momento.body.call.id}/cancelar`);

    const agendada = await createCall(master, "agendada");
    const expiresAgendada = new Date(agendada.body.call.offerExpiresAt).getTime();
    expect(expiresAgendada - Date.now()).toBeGreaterThan(29 * 60_000);
    expect(expiresAgendada - Date.now()).toBeLessThan(31 * 60_000);
  });

  it("enters waiting_for_available when nobody is disponivel, logging a fresh event", async () => {
    await makeDriver({ carNumber: "543", phone: "(13) 90002-0004", operationalStatus: "indisponivel" });
    const master = await loginAsMaster();

    const res = await createCall(master);
    expect(res.body.call.status).toBe("waiting_for_available");
    expect(res.body.call.candidateDriverId).toBeNull();

    const events = await master.get(`/api/cidade/calls/${res.body.call.id}/events`);
    expect(events.body.events.map((e: any) => e.type)).toEqual(["entered_waiting"]);
  });

  it("rejects a second call while one is already active (offering or waiting)", async () => {
    await makeDriver({ carNumber: "543", phone: "(13) 90002-0005" });
    const master = await loginAsMaster();
    await createCall(master);
    const second = await createCall(master);
    expect(second.status).toBe(409);
  });

  it("rejects a call with a past date/time", async () => {
    await makeDriver({ carNumber: "543", phone: "(13) 90002-0006" });
    const master = await loginAsMaster();
    const res = await master.post("/api/cidade/calls").send({ data: "2020-01-01", cidade: "Santos", horario: "10:00", type: "momento" });
    expect(res.status).toBe(400);
  });

  it("allows admin_comum to create a call", async () => {
    await makeDriver({ carNumber: "543", phone: "(13) 90002-0007" });
    const comum = await loginAsComum();
    const res = await createCall(comum);
    expect(res.status).toBe(201);
  });
});

describe("accept / decline", () => {
  it("only the current candidate can accept; accepting defaults them to indisponivel and sends them to the back of the queue", async () => {
    const { agent: candidateAgent, driver: candidate } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0010", cidadeQueueSeq: 1 });
    const { agent: otherAgent } = await makeDriver({ carNumber: "519", phone: "(13) 90002-0011", cidadeQueueSeq: 2 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    const callId = created.body.call.id;

    const wrongDriver = await otherAgent.post(`/api/cidade/calls/${callId}/aceitar`);
    expect(wrongDriver.status).toBe(403);

    const accepted = await candidateAgent.post(`/api/cidade/calls/${callId}/aceitar`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.call.status).toBe("concluido");

    const freshDriver = await prisma.driver.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(freshDriver.operationalStatus).toBe("indisponivel");

    const current = await master.get("/api/cidade/current");
    expect(current.body.call).toBeNull();
  });

  it("a driver can flip themselves back to disponivel right after accepting a call — no lock, self-managed", async () => {
    const { agent: candidateAgent, driver: candidate } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0017", cidadeQueueSeq: 1 });
    const master = await loginAsMaster();
    const created = await createCall(master);

    await candidateAgent.post(`/api/cidade/calls/${created.body.call.id}/aceitar`);
    const freshDriver = await prisma.driver.findUniqueOrThrow({ where: { id: candidate.id } });
    expect(freshDriver.operationalStatus).toBe("indisponivel");

    const flip = await candidateAgent.patch("/api/drivers/me/status").send({ status: "disponivel" });
    expect(flip.status).toBe(200);
    expect(flip.body.driver.operationalStatus).toBe("disponivel");
  });

  it("declining moves the candidate to the back and offers the next disponivel driver a fresh SLA", async () => {
    const { agent: aAgent, driver: a } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0012", cidadeQueueSeq: 1 });
    const { driver: b } = await makeDriver({ carNumber: "519", phone: "(13) 90002-0013", cidadeQueueSeq: 2 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    expect(created.body.call.candidateDriverId).toBe(a.id);

    const declined = await aAgent.post(`/api/cidade/calls/${created.body.call.id}/recusar`);
    expect(declined.status).toBe(204);

    const current = await master.get("/api/cidade/current");
    expect(current.body.call.candidateDriverId).toBe(b.id);
    expect(current.body.call.status).toBe("offering");

    const freshA = await prisma.driver.findUniqueOrThrow({ where: { id: a.id } });
    const freshB = await prisma.driver.findUniqueOrThrow({ where: { id: b.id } });
    expect(freshA.cidadeQueueSeq > freshB.cidadeQueueSeq).toBe(true);

    const events = await master.get(`/api/cidade/calls/${created.body.call.id}/events`);
    expect(events.body.events.map((e: any) => e.type)).toEqual(["offered", "declined", "offered"]);
  });

  it("declining with nobody else available enters waiting_for_available", async () => {
    const { agent } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0014" });
    const master = await loginAsMaster();
    const created = await createCall(master);

    await agent.post(`/api/cidade/calls/${created.body.call.id}/recusar`);

    const current = await master.get("/api/cidade/current");
    expect(current.body.call.status).toBe("waiting_for_available");
  });

  it("timeout and explicit decline are logged as distinct event types (not conflated)", async () => {
    const { driver: a } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0015", cidadeQueueSeq: 1 });
    await makeDriver({ carNumber: "519", phone: "(13) 90002-0016", cidadeQueueSeq: 2 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    expect(created.body.call.candidateDriverId).toBe(a.id);

    await prisma.coturCidadeCall.update({
      where: { id: created.body.call.id },
      data: { offerExpiresAt: new Date(Date.now() - 1000) },
    });
    const swept = await sweepOnce();
    expect(swept).not.toBeNull();

    const events = await master.get(`/api/cidade/calls/${created.body.call.id}/events`);
    expect(events.body.events.map((e: any) => e.type)).toEqual(["offered", "timed_out", "offered"]);
  });
});

describe("server-authoritative SLA expiry (sweep)", () => {
  it("sweepOnce does nothing when no call has expired", async () => {
    await makeDriver({ carNumber: "543", phone: "(13) 90002-0020" });
    const master = await loginAsMaster();
    await createCall(master);

    const result = await sweepOnce();
    expect(result).toBeNull();
  });

  it("picks up an expired offer and cascades to the next driver, or waiting if none left", async () => {
    const { driver: a } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0021", cidadeQueueSeq: 1 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    expect(created.body.call.candidateDriverId).toBe(a.id);

    await prisma.coturCidadeCall.update({
      where: { id: created.body.call.id },
      data: { offerExpiresAt: new Date(Date.now() - 1000) },
    });

    const result = await sweepOnce();
    expect(result).toEqual({ type: "waiting", callId: created.body.call.id });

    const freshA = await prisma.driver.findUniqueOrThrow({ where: { id: a.id } });
    expect(freshA.cidadeQueueSeq).toBeGreaterThan(1n);
  });

  it("restart-safety: state lives entirely in the DB row, no in-memory timers needed", async () => {
    const { driver: a } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0022", cidadeQueueSeq: 1 });
    const master = await loginAsMaster();
    const created = await createCall(master);

    // Simulate "the process restarted": nothing but the DB row carries state, so a fresh sweepOnce()
    // call (as if from a brand-new process) still finds and processes the expired offer correctly.
    await prisma.coturCidadeCall.update({
      where: { id: created.body.call.id },
      data: { offerExpiresAt: new Date(Date.now() - 5000) },
    });
    const result = await sweepOnce();
    expect(result).not.toBeNull();
    const freshA = await prisma.driver.findUniqueOrThrow({ where: { id: a.id } });
    expect(freshA.cidadeQueueSeq).toBeGreaterThan(1n);
  });
});

describe("waiting_for_available: driver becoming available triggers immediate offer", () => {
  it("offers the call the instant a driver flips to disponivel, with a fresh full SLA", async () => {
    const { agent } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0030", operationalStatus: "indisponivel" });
    const master = await loginAsMaster();
    const created = await createCall(master);
    expect(created.body.call.status).toBe("waiting_for_available");

    const flip = await agent.patch("/api/drivers/me/status").send({ status: "disponivel" });
    expect(flip.status).toBe(200);

    const current = await master.get("/api/cidade/current");
    expect(current.body.call.status).toBe("offering");
    expect(new Date(current.body.call.offerExpiresAt).getTime()).toBeGreaterThan(Date.now());
  });

  it("also triggers when a driver who just accepted a ride flips themselves back to disponivel (self-managed, no finalize step)", async () => {
    const { agent, driver } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0031", cidadeQueueSeq: 1 });
    const master = await loginAsMaster();

    const firstCall = await createCall(master);
    await agent.post(`/api/cidade/calls/${firstCall.body.call.id}/aceitar`);
    const midTrip = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    expect(midTrip.operationalStatus).toBe("indisponivel");

    const secondCall = await createCall(master);
    expect(secondCall.body.call.status).toBe("waiting_for_available");

    const flip = await agent.patch("/api/drivers/me/status").send({ status: "disponivel" });
    expect(flip.status).toBe(200);
    expect(flip.body.driver.operationalStatus).toBe("disponivel");

    const current = await master.get("/api/cidade/current");
    expect(current.body.call.status).toBe("offering");
    expect(current.body.call.candidateDriverId).toBe(driver.id);
  });

  it("re-entering waiting_for_available logs a new event every time (repeated notification, not deduped)", async () => {
    const { agent, driver } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0032" });
    const master = await loginAsMaster();
    const created = await createCall(master);
    expect(created.body.call.candidateDriverId).toBe(driver.id);

    // Decline -> nobody left -> waiting (1st time)
    await agent.post(`/api/cidade/calls/${created.body.call.id}/recusar`);
    let current = await master.get("/api/cidade/current");
    expect(current.body.call.status).toBe("waiting_for_available");

    // Become available -> offered again -> decline again -> waiting (2nd time)
    await agent.patch("/api/drivers/me/status").send({ status: "disponivel" });
    current = await master.get("/api/cidade/current");
    expect(current.body.call.status).toBe("offering");
    await agent.post(`/api/cidade/calls/${created.body.call.id}/recusar`);

    const events = await master.get(`/api/cidade/calls/${created.body.call.id}/events`);
    const waitingEvents = events.body.events.filter((e: any) => e.type === "entered_waiting");
    expect(waitingEvents).toHaveLength(2);
  });
});

describe("master cancel", () => {
  it("cancels an active offering call; comum cannot", async () => {
    await makeDriver({ carNumber: "543", phone: "(13) 90002-0040" });
    const master = await loginAsMaster();
    const comum = await loginAsComum();
    const created = await createCall(master);

    const forbidden = await comum.post(`/api/cidade/calls/${created.body.call.id}/cancelar`);
    expect(forbidden.status).toBe(403);

    const cancelled = await master.post(`/api/cidade/calls/${created.body.call.id}/cancelar`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.call.status).toBe("cancelado");
  });

  it("cancels a call that's sitting in waiting_for_available", async () => {
    await makeDriver({ carNumber: "543", phone: "(13) 90002-0041", operationalStatus: "indisponivel" });
    const master = await loginAsMaster();
    const created = await createCall(master);
    expect(created.body.call.status).toBe("waiting_for_available");

    const cancelled = await master.post(`/api/cidade/calls/${created.body.call.id}/cancelar`);
    expect(cancelled.status).toBe(200);

    const current = await master.get("/api/cidade/current");
    expect(current.body.call).toBeNull();
  });
});

describe("history", () => {
  it("master sees every closed call; comum sees only their own", async () => {
    await makeDriver({ carNumber: "543", phone: "(13) 90002-0050" });
    const master = await loginAsMaster();
    const comum = await loginAsComum();

    const byComum = await createCall(comum);
    await master.post(`/api/cidade/calls/${byComum.body.call.id}/cancelar`);

    const byMaster = await createCall(master);
    await master.post(`/api/cidade/calls/${byMaster.body.call.id}/cancelar`);

    const masterHistory = await master.get("/api/cidade/history");
    expect(masterHistory.body.calls).toHaveLength(2);

    const comumHistory = await comum.get("/api/cidade/history");
    expect(comumHistory.body.calls).toHaveLength(1);
    expect(comumHistory.body.calls[0].id).toBe(byComum.body.call.id);
  });
});

describe("pre-answers: drivers can respond before their official turn", () => {
  it("a non-candidate can't use /responder to skip the line while it's their turn already", async () => {
    const { agent, driver } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0070", cidadeQueueSeq: 1 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    expect(created.body.call.candidateDriverId).toBe(driver.id);

    const res = await agent.post(`/api/cidade/calls/${created.body.call.id}/responder`).send({ resposta: "disponivel" });
    expect(res.status).toBe(409);
  });

  it("pre-answering 'indisponivel' makes the driver get skipped the instant their turn comes, no timer wasted", async () => {
    const { driver: a } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0071", cidadeQueueSeq: 1 });
    const { agent: bAgent, driver: b } = await makeDriver({ carNumber: "519", phone: "(13) 90002-0072", cidadeQueueSeq: 2 });
    const { driver: c } = await makeDriver({ carNumber: "521", phone: "(13) 90002-0073", cidadeQueueSeq: 3 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    const callId = created.body.call.id;
    expect(created.body.call.candidateDriverId).toBe(a.id);

    // B (not yet the candidate) pre-answers "indisponivel" while A is still officially offering.
    const pre = await bAgent.post(`/api/cidade/calls/${callId}/responder`).send({ resposta: "indisponivel" });
    expect(pre.status).toBe(200);
    expect(pre.body.response).toEqual({ driverId: b.id, response: "indisponivel", updatedAt: expect.any(String) });

    // A declines -> engine must skip straight past B (already answered no) and land on C.
    const aAgent = request.agent(app);
    await aAgent.post("/api/auth/driver/login").send({ telefone: a.phone, senha: "senha123" });
    const declined = await aAgent.post(`/api/cidade/calls/${callId}/recusar`);
    expect(declined.status).toBe(204);

    const current = await master.get("/api/cidade/current");
    expect(current.body.call.candidateDriverId).toBe(c.id);
    expect(current.body.call.status).toBe("offering");

    // B was consumed (skipped) for this call and sent to the back of the queue, same as an explicit decline.
    const freshB = await prisma.driver.findUniqueOrThrow({ where: { id: b.id } });
    const freshC = await prisma.driver.findUniqueOrThrow({ where: { id: c.id } });
    expect(freshB.cidadeQueueSeq > freshC.cidadeQueueSeq).toBe(true);

    const events = await master.get(`/api/cidade/calls/${callId}/events`);
    expect(events.body.events.map((e: any) => e.type)).toEqual(["offered", "declined", "declined", "offered"]);
  });

  it("pre-answering 'disponivel' auto-assigns the call the instant it's their turn, skipping the offer/timer step entirely", async () => {
    const { driver: a } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0074", cidadeQueueSeq: 1 });
    const { agent: bAgent, driver: b } = await makeDriver({ carNumber: "519", phone: "(13) 90002-0075", cidadeQueueSeq: 2 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    const callId = created.body.call.id;
    expect(created.body.call.candidateDriverId).toBe(a.id);

    const pre = await bAgent.post(`/api/cidade/calls/${callId}/responder`).send({ resposta: "disponivel" });
    expect(pre.status).toBe(200);

    const aAgent = request.agent(app);
    await aAgent.post("/api/auth/driver/login").send({ telefone: a.phone, senha: "senha123" });
    const declined = await aAgent.post(`/api/cidade/calls/${callId}/recusar`);
    expect(declined.status).toBe(204);

    // No "offering" step for B — the call should already be concluido, assigned straight to B.
    const current = await master.get("/api/cidade/current");
    expect(current.body.call).toBeNull();

    const history = await master.get("/api/cidade/history");
    const closed = history.body.calls.find((c: any) => c.id === callId);
    expect(closed.status).toBe("concluido");
    expect(closed.acceptedCarSnap).toBe(b.carNumber);

    const freshB = await prisma.driver.findUniqueOrThrow({ where: { id: b.id } });
    expect(freshB.operationalStatus).toBe("indisponivel");

    const events = await master.get(`/api/cidade/calls/${callId}/events`);
    expect(events.body.events.map((e: any) => e.type)).toEqual(["offered", "declined", "accepted"]);
  });

  it("still respects queue order: an early 'disponivel' from someone further back never jumps ahead of an unanswered higher-priority driver", async () => {
    const { driver: a } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0076", cidadeQueueSeq: 1 });
    const { agent: bAgent, driver: b } = await makeDriver({ carNumber: "519", phone: "(13) 90002-0077", cidadeQueueSeq: 2 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    const callId = created.body.call.id;

    // B answers "disponivel" early, but A (first in line) hasn't answered at all yet.
    await bAgent.post(`/api/cidade/calls/${callId}/responder`).send({ resposta: "disponivel" });

    const current = await master.get("/api/cidade/current");
    expect(current.body.call.status).toBe("offering");
    expect(current.body.call.candidateDriverId).toBe(a.id); // still A's turn, not auto-jumped to B
  });

  it("GET /current exposes the response board so admins can see who answered what in real time", async () => {
    const { driver: a } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0078", cidadeQueueSeq: 1 });
    const { agent: bAgent, driver: b } = await makeDriver({ carNumber: "519", phone: "(13) 90002-0079", cidadeQueueSeq: 2 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    const callId = created.body.call.id;
    expect(created.body.call.candidateDriverId).toBe(a.id);

    await bAgent.post(`/api/cidade/calls/${callId}/responder`).send({ resposta: "indisponivel" });

    const current = await master.get("/api/cidade/current");
    expect(current.body.responses).toEqual([{ driverId: b.id, response: "indisponivel", updatedAt: expect.any(String) }]);
  });

  it("a driver can change their mind before their turn comes, upserting the latest answer", async () => {
    const { driver: a } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0080", cidadeQueueSeq: 1 });
    const { agent: bAgent, driver: b } = await makeDriver({ carNumber: "519", phone: "(13) 90002-0081", cidadeQueueSeq: 2 });
    const master = await loginAsMaster();
    const created = await createCall(master);
    const callId = created.body.call.id;

    await bAgent.post(`/api/cidade/calls/${callId}/responder`).send({ resposta: "indisponivel" });
    await bAgent.post(`/api/cidade/calls/${callId}/responder`).send({ resposta: "disponivel" });

    const current = await master.get("/api/cidade/current");
    expect(current.body.responses).toEqual([{ driverId: b.id, response: "disponivel", updatedAt: expect.any(String) }]);

    const aAgent = request.agent(app);
    await aAgent.post("/api/auth/driver/login").send({ telefone: a.phone, senha: "senha123" });
    await aAgent.post(`/api/cidade/calls/${callId}/recusar`);

    const after = await master.get("/api/cidade/current");
    expect(after.body.call).toBeNull(); // B's latest answer (disponivel) won, auto-accepted
  });

  it("rejects responding to a call that doesn't exist or is already closed", async () => {
    const { agent } = await makeDriver({ carNumber: "543", phone: "(13) 90002-0082" });
    const res = await agent.post("/api/cidade/calls/does-not-exist/responder").send({ resposta: "disponivel" });
    expect(res.status).toBe(404);
  });
});

describe("concurrency: two drivers becoming available at once while a call waits", () => {
  it("safety: exactly one becomes the candidate, never both, never neither", async () => {
    // Note on determinism: the driver-status write is decoupled from the call-row lock specifically
    // so that whichever request wins the lock race sees BOTH drivers as disponivel in the common case,
    // and therefore picks the correct one by queue order (see the /me/status handler for the reasoning).
    // That said, under a literal same-millisecond race there's no way to guarantee which HTTP request's
    // transaction reaches the eligibility scan first without adding artificial latency to every status
    // flip — so the property this test actually enforces, the one that matters for correctness, is
    // safety: exactly one call gets exactly one candidate, never both drivers, never neither.
    const { agent: aAgent, driver: a } = await makeDriver({
      carNumber: "543",
      phone: "(13) 90002-0060",
      cidadeQueueSeq: 5,
      operationalStatus: "indisponivel",
    });
    const { agent: bAgent, driver: b } = await makeDriver({
      carNumber: "519",
      phone: "(13) 90002-0061",
      cidadeQueueSeq: 3,
      operationalStatus: "indisponivel",
    });
    const master = await loginAsMaster();
    const created = await createCall(master);
    expect(created.body.call.status).toBe("waiting_for_available");

    const [resA, resB] = await Promise.all([
      aAgent.patch("/api/drivers/me/status").send({ status: "disponivel" }),
      bAgent.patch("/api/drivers/me/status").send({ status: "disponivel" }),
    ]);
    expect(resA.status).toBe(200);
    expect(resB.status).toBe(200);

    const current = await master.get("/api/cidade/current");
    expect(current.body.call.status).toBe("offering");
    expect([a.id, b.id]).toContain(current.body.call.candidateDriverId);

    const events = await master.get(`/api/cidade/calls/${created.body.call.id}/events`);
    const offeredEvents = events.body.events.filter((e: any) => e.type === "offered");
    expect(offeredEvents).toHaveLength(1);
  });
});
