import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

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

async function loginAsDriver(data: { carNumber: string; phone: string; tripCount?: number; priorityRank?: number }) {
  const driver = await prisma.driver.create({
    data: {
      carNumber: data.carNumber,
      name: `Motorista ${data.carNumber}`,
      phone: data.phone,
      passwordHash: await hashPassword("senha123"),
      mustSetPassword: false,
      approvalStatus: "aprovado",
      tripCount: data.tripCount ?? 0,
      priorityRank: data.priorityRank ?? 0,
    },
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/driver/login").send({ telefone: driver.phone, senha: "senha123" });
  return { agent, driver };
}

function futureDate() {
  const d = new Date(Date.now() + 24 * 60 * 60 * 1000);
  return d.toISOString().slice(0, 10);
}

describe("queue ordering", () => {
  it("orders by trip count ascending, then priority rank", async () => {
    await loginAsDriver({ carNumber: "519", phone: "(13) 90001-0001", tripCount: 6, priorityRank: 2 });
    await loginAsDriver({ carNumber: "543", phone: "(13) 90001-0002", tripCount: 6, priorityRank: 1 });
    await loginAsDriver({ carNumber: "604", phone: "(13) 90001-0003", tripCount: 5, priorityRank: 5 });

    const master = await loginAsMaster();
    const res = await master.get("/api/viagem/queue");
    expect(res.body.queue.map((d: any) => d.carNumber)).toEqual(["604", "543", "519"]);
  });
});

describe("creating a request", () => {
  it("rejects a request with a date/time in the past", async () => {
    await loginAsDriver({ carNumber: "543", phone: "(13) 90001-0004" });
    const master = await loginAsMaster();
    const res = await master
      .post("/api/viagem/requests")
      .send({ data: "2020-01-01", cidade: "Santos", horario: "10:00" });
    expect(res.status).toBe(400);
  });

  it("rejects when no approved driver exists", async () => {
    const master = await loginAsMaster();
    const res = await master
      .post("/api/viagem/requests")
      .send({ data: futureDate(), cidade: "Santos", horario: "10:00" });
    expect(res.status).toBe(400);
  });

  it("allows admin_comum to create, but not a driver", async () => {
    await loginAsDriver({ carNumber: "543", phone: "(13) 90001-0005" });
    const comum = await loginAsComum();
    const res = await comum.post("/api/viagem/requests").send({ data: futureDate(), cidade: "Santos", horario: "10:00" });
    expect(res.status).toBe(201);

    const { agent: driverAgent } = await loginAsDriver({ carNumber: "519", phone: "(13) 90001-0006" });
    const forbidden = await driverAgent
      .post("/api/viagem/requests")
      .send({ data: futureDate(), cidade: "Santos", horario: "10:00" });
    expect(forbidden.status).toBe(403);
  });

  it("refuses a second request while one is already open", async () => {
    await loginAsDriver({ carNumber: "543", phone: "(13) 90001-0007" });
    const master = await loginAsMaster();
    await master.post("/api/viagem/requests").send({ data: futureDate(), cidade: "Santos", horario: "10:00" });
    const second = await master.post("/api/viagem/requests").send({ data: futureDate(), cidade: "Santos", horario: "11:00" });
    expect(second.status).toBe(409);
  });
});

describe("accepting a request", () => {
  it("only the current queue head can accept; trip count increments and the call closes", async () => {
    const { agent: headAgent, driver: head } = await loginAsDriver({
      carNumber: "543",
      phone: "(13) 90001-0008",
      tripCount: 5,
      priorityRank: 1,
    });
    const { agent: otherAgent } = await loginAsDriver({
      carNumber: "519",
      phone: "(13) 90001-0009",
      tripCount: 9,
      priorityRank: 2,
    });

    const master = await loginAsMaster();
    const created = await master.post("/api/viagem/requests").send({ data: futureDate(), cidade: "Santos", horario: "10:00" });
    const callId = created.body.call.id;

    const wrongTurn = await otherAgent.post(`/api/viagem/requests/${callId}/aceitar`);
    expect(wrongTurn.status).toBe(403);

    const accepted = await headAgent.post(`/api/viagem/requests/${callId}/aceitar`);
    expect(accepted.status).toBe(200);
    expect(accepted.body.call.status).toBe("concluido");

    const freshDriver = await prisma.driver.findUniqueOrThrow({ where: { id: head.id } });
    expect(freshDriver.tripCount).toBe(6);

    const current = await master.get("/api/viagem/current");
    expect(current.body.call).toBeNull();
  });

  it("recomputes the head live — a manual trip-count edit before accept changes who's eligible", async () => {
    const { agent: aAgent, driver: a } = await loginAsDriver({ carNumber: "543", phone: "(13) 90001-0010", tripCount: 3, priorityRank: 1 });
    const { agent: bAgent, driver: b } = await loginAsDriver({ carNumber: "519", phone: "(13) 90001-0011", tripCount: 4, priorityRank: 2 });

    const master = await loginAsMaster();
    const created = await master.post("/api/viagem/requests").send({ data: futureDate(), cidade: "Santos", horario: "10:00" });
    const callId = created.body.call.id;

    // Master corrects A's count upward mid-flight — B should now be eligible, not A.
    await master.patch(`/api/drivers/${a.id}/trip-count`).send({ tripCount: 10 });

    const aTries = await aAgent.post(`/api/viagem/requests/${callId}/aceitar`);
    expect(aTries.status).toBe(403);

    const bTries = await bAgent.post(`/api/viagem/requests/${callId}/aceitar`);
    expect(bTries.status).toBe(200);
  });
});

describe("cancelling a request", () => {
  it("lets master cancel an open request; comum cannot", async () => {
    await loginAsDriver({ carNumber: "543", phone: "(13) 90001-0012" });
    const master = await loginAsMaster();
    const comum = await loginAsComum();
    const created = await master.post("/api/viagem/requests").send({ data: futureDate(), cidade: "Santos", horario: "10:00" });
    const callId = created.body.call.id;

    const forbidden = await comum.post(`/api/viagem/requests/${callId}/cancelar`);
    expect(forbidden.status).toBe(403);

    const cancelled = await master.post(`/api/viagem/requests/${callId}/cancelar`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.call.status).toBe("cancelado");
  });
});

describe("history", () => {
  it("master sees every closed request; comum sees only their own", async () => {
    await loginAsDriver({ carNumber: "543", phone: "(13) 90001-0013" });
    const master = await loginAsMaster();
    const comum = await loginAsComum();

    const byComum = await comum.post("/api/viagem/requests").send({ data: futureDate(), cidade: "Santos", horario: "10:00" });
    await comum.post(`/api/viagem/requests/${byComum.body.call.id}/cancelar`).catch(() => {});
    await master.post(`/api/viagem/requests/${byComum.body.call.id}/cancelar`);

    const byMaster = await master.post("/api/viagem/requests").send({ data: futureDate(), cidade: "Cubatão", horario: "11:00" });
    await master.post(`/api/viagem/requests/${byMaster.body.call.id}/cancelar`);

    const masterHistory = await master.get("/api/viagem/history");
    expect(masterHistory.body.calls).toHaveLength(2);

    const comumHistory = await comum.get("/api/viagem/history");
    expect(comumHistory.body.calls).toHaveLength(1);
    expect(comumHistory.body.calls[0].city).toBe("Santos");
  });
});
