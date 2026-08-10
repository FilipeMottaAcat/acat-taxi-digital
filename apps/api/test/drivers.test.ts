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

describe("admin_comum is blocked from all driver management", () => {
  it("rejects list, approve, block, delete, trip-count, priority-order", async () => {
    const comum = await loginAsComum();
    const driver = await prisma.driver.create({
      data: { carNumber: "543", name: "X", phone: "(13) 90000-0010", approvalStatus: "pendente" },
    });

    expect((await comum.get("/api/drivers")).status).toBe(403);
    expect((await comum.patch(`/api/drivers/${driver.id}/approve`)).status).toBe(403);
    expect((await comum.patch(`/api/drivers/${driver.id}/block`)).status).toBe(403);
    expect((await comum.delete(`/api/drivers/${driver.id}`)).status).toBe(403);
    expect((await comum.patch(`/api/drivers/${driver.id}/trip-count`).send({ tripCount: 3 })).status).toBe(403);
    expect((await comum.put("/api/drivers/priority-order").send({ driverIds: [driver.id] })).status).toBe(403);
  });
});

describe("manual add", () => {
  it("creates an already-approved driver at the back of both queues", async () => {
    const master = await loginAsMaster();
    const res = await master.post("/api/drivers").send({
      telefone: "(13) 90000-0011",
      carro: "543",
      nome: "Novo Motorista",
    });
    expect(res.status).toBe(201);
    expect(res.body.driver.approvalStatus).toBe("aprovado");
    expect(res.body.driver.mustSetPassword).toBe(true);
  });

  it("rejects duplicate phone or car number", async () => {
    const master = await loginAsMaster();
    await prisma.driver.create({ data: { carNumber: "543", name: "X", phone: "(13) 90000-0012", approvalStatus: "aprovado" } });

    const dupPhone = await master.post("/api/drivers").send({ telefone: "(13) 90000-0012", carro: "519", nome: "Y" });
    expect(dupPhone.status).toBe(409);

    const dupCar = await master.post("/api/drivers").send({ telefone: "(13) 90000-0013", carro: "543", nome: "Z" });
    expect(dupCar.status).toBe(409);
  });
});

describe("approve / reject", () => {
  it("approves a pending driver and assigns queue positions", async () => {
    const master = await loginAsMaster();
    const driver = await prisma.driver.create({
      data: { carNumber: "543", name: "Pendente", phone: "(13) 90000-0014", approvalStatus: "pendente" },
    });

    const res = await master.patch(`/api/drivers/${driver.id}/approve`);
    expect(res.status).toBe(200);
    expect(res.body.driver.approvalStatus).toBe("aprovado");
    expect(res.body.driver.priorityRank).toBeGreaterThan(0);
  });

  it("rejects a pending driver with a reason, visible on the driver record", async () => {
    const master = await loginAsMaster();
    const driver = await prisma.driver.create({
      data: { carNumber: "543", name: "Pendente", phone: "(13) 90000-0015", approvalStatus: "pendente" },
    });

    const res = await master.patch(`/api/drivers/${driver.id}/reject`).send({ motivo: "Documentação incompleta" });
    expect(res.status).toBe(200);
    expect(res.body.driver.approvalStatus).toBe("rejeitado");
    expect(res.body.driver.rejectionReason).toBe("Documentação incompleta");
  });

  it("refuses to approve/reject a driver that isn't pending", async () => {
    const master = await loginAsMaster();
    const driver = await prisma.driver.create({
      data: { carNumber: "543", name: "Já aprovado", phone: "(13) 90000-0016", approvalStatus: "aprovado" },
    });

    expect((await master.patch(`/api/drivers/${driver.id}/approve`)).status).toBe(409);
    expect((await master.patch(`/api/drivers/${driver.id}/reject`).send({ motivo: "x" })).status).toBe(409);
  });
});

describe("block / unblock", () => {
  it("blocks and unblocks a driver, sending them to the back of the Cidade queue on unblock", async () => {
    const master = await loginAsMaster();
    const other = await prisma.driver.create({
      data: { carNumber: "519", name: "Outro", phone: "(13) 90000-0017", approvalStatus: "aprovado", cidadeQueueSeq: 5n },
    });
    const driver = await prisma.driver.create({
      data: { carNumber: "543", name: "Motorista", phone: "(13) 90000-0018", approvalStatus: "aprovado", cidadeQueueSeq: 1n },
    });

    const blocked = await master.patch(`/api/drivers/${driver.id}/block`);
    expect(blocked.body.driver.blocked).toBe(true);

    const unblocked = await master.patch(`/api/drivers/${driver.id}/unblock`);
    expect(unblocked.body.driver.blocked).toBe(false);
    expect(unblocked.body.driver.priorityRank).toBeDefined();

    const fresh = await prisma.driver.findUniqueOrThrow({ where: { id: driver.id } });
    const otherFresh = await prisma.driver.findUniqueOrThrow({ where: { id: other.id } });
    expect(fresh.cidadeQueueSeq > otherFresh.cidadeQueueSeq).toBe(true);
  });
});

describe("reset password", () => {
  it("clears the password hash and resolves any pending reset request", async () => {
    const master = await loginAsMaster();
    const driver = await prisma.driver.create({
      data: {
        carNumber: "543",
        name: "Motorista",
        phone: "(13) 90000-0019",
        approvalStatus: "aprovado",
        passwordHash: await hashPassword("antiga"),
        mustSetPassword: false,
      },
    });
    const resetRequest = await prisma.passwordResetRequest.create({ data: { driverId: driver.id } });

    const res = await master.post(`/api/drivers/${driver.id}/reset-password`);
    expect(res.status).toBe(200);
    expect(res.body.driver.mustSetPassword).toBe(true);

    const updatedRequest = await prisma.passwordResetRequest.findUniqueOrThrow({ where: { id: resetRequest.id } });
    expect(updatedRequest.status).toBe("resolved");
  });
});

describe("trip count adjustments", () => {
  it("sets an absolute trip count and resets all to zero", async () => {
    const master = await loginAsMaster();
    const d1 = await prisma.driver.create({
      data: { carNumber: "543", name: "A", phone: "(13) 90000-0020", approvalStatus: "aprovado", tripCount: 10 },
    });
    const d2 = await prisma.driver.create({
      data: { carNumber: "519", name: "B", phone: "(13) 90000-0021", approvalStatus: "aprovado", tripCount: 20 },
    });

    const adjusted = await master.patch(`/api/drivers/${d1.id}/trip-count`).send({ tripCount: 7 });
    expect(adjusted.body.driver.tripCount).toBe(7);

    const rejectsNegative = await master.patch(`/api/drivers/${d1.id}/trip-count`).send({ tripCount: -1 });
    expect(rejectsNegative.status).toBe(400);

    const resetAll = await master.post("/api/drivers/trip-count/reset-all");
    expect(resetAll.status).toBe(200);
    const fresh1 = await prisma.driver.findUniqueOrThrow({ where: { id: d1.id } });
    const fresh2 = await prisma.driver.findUniqueOrThrow({ where: { id: d2.id } });
    expect(fresh1.tripCount).toBe(0);
    expect(fresh2.tripCount).toBe(0);
  });
});

describe("priority order", () => {
  it("reorders the Cotur Viagem tiebreak list", async () => {
    const master = await loginAsMaster();
    const a = await prisma.driver.create({ data: { carNumber: "543", name: "A", phone: "(13) 90000-0022", approvalStatus: "aprovado", priorityRank: 1 } });
    const b = await prisma.driver.create({ data: { carNumber: "519", name: "B", phone: "(13) 90000-0023", approvalStatus: "aprovado", priorityRank: 2 } });

    const res = await master.put("/api/drivers/priority-order").send({ driverIds: [b.id, a.id] });
    expect(res.status).toBe(200);

    const freshA = await prisma.driver.findUniqueOrThrow({ where: { id: a.id } });
    const freshB = await prisma.driver.findUniqueOrThrow({ where: { id: b.id } });
    expect(freshB.priorityRank).toBeLessThan(freshA.priorityRank);
  });
});

describe("delete driver (soft delete with history)", () => {
  it("removes the driver, frees the phone/car number, and preserves a history snapshot", async () => {
    const master = await loginAsMaster();
    const driver = await prisma.driver.create({
      data: { carNumber: "543", name: "Excluído", phone: "(13) 90000-0024", approvalStatus: "aprovado", tripCount: 4 },
    });

    const res = await master.delete(`/api/drivers/${driver.id}`).send({ motivo: "Saiu da empresa" });
    expect(res.status).toBe(204);

    const gone = await prisma.driver.findUnique({ where: { id: driver.id } });
    expect(gone).toBeNull();

    const history = await prisma.driverDeletionHistory.findFirst({ where: { originalDriverId: driver.id } });
    expect(history?.carNumber).toBe("543");
    expect(history?.tripCount).toBe(4);
    expect(history?.reason).toBe("Saiu da empresa");

    // phone/car number immediately reusable
    const signup = await request(app).post("/api/auth/driver/signup").send({
      telefone: "(13) 90000-0024",
      carro: "543",
      nome: "Substituto",
      senha: "senha123",
      confirmarSenha: "senha123",
    });
    expect(signup.status).toBe(201);
  });
});

describe("driver self-service", () => {
  async function loginAsDriver(overrides: Partial<Parameters<typeof prisma.driver.create>[0]["data"]> = {}) {
    const passwordHash = await hashPassword("senha123");
    const driver = await prisma.driver.create({
      data: {
        carNumber: "543",
        name: "Motorista",
        phone: "(13) 90000-0025",
        approvalStatus: "aprovado",
        passwordHash,
        mustSetPassword: false,
        ...overrides,
      },
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/driver/login").send({ telefone: driver.phone, senha: "senha123" });
    return { agent, driver };
  }

  it("lets a driver toggle disponivel/indisponivel", async () => {
    const { agent } = await loginAsDriver();
    const res = await agent.patch("/api/drivers/me/status").send({ status: "disponivel" });
    expect(res.status).toBe(200);
    expect(res.body.driver.operationalStatus).toBe("disponivel");
  });

  it("refuses to let a driver self-change status while em_viagem", async () => {
    const { agent } = await loginAsDriver({ operationalStatus: "em_viagem" });
    const res = await agent.patch("/api/drivers/me/status").send({ status: "disponivel" });
    expect(res.status).toBe(409);
  });

  it("creates a password reset request and blocks duplicates", async () => {
    const { agent } = await loginAsDriver();
    const first = await agent.post("/api/drivers/me/request-password-reset");
    expect(first.status).toBe(201);

    const second = await agent.post("/api/drivers/me/request-password-reset");
    expect(second.status).toBe(409);
  });

  it("lets master see the pending request list", async () => {
    const { driver } = await loginAsDriver();
    await prisma.passwordResetRequest.create({ data: { driverId: driver.id } });

    const master = await loginAsMaster();
    const res = await master.get("/api/drivers/password-reset-requests");
    expect(res.status).toBe(200);
    expect(res.body.requests).toHaveLength(1);
    expect(res.body.requests[0].driver.id).toBe(driver.id);
  });
});
