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

describe("error handling: unknown ids never crash the server", () => {
  it("returns a clean 404 (not a raw 500) when acting on a driver id that doesn't exist", async () => {
    const master = await loginAsMaster();
    const bogusId = "does-not-exist";

    const block = await master.patch(`/api/drivers/${bogusId}/block`);
    expect(block.status).toBe(404);
    expect(block.body).toHaveProperty("error");

    const resetPw = await master.post(`/api/drivers/${bogusId}/reset-password`);
    expect(resetPw.status).toBe(404);

    const tripCount = await master.patch(`/api/drivers/${bogusId}/trip-count`).send({ tripCount: 3 });
    expect(tripCount.status).toBe(404);
  });

  it("returns a clean 404 for an admin activate/deactivate on an unknown id", async () => {
    const master = await loginAsMaster();
    const res = await master.patch("/api/admins/does-not-exist/activate");
    expect(res.status).toBe(404);
    expect(res.body).toHaveProperty("error");
  });
});

describe("input validation rejects malformed bodies with 400, not 500", () => {
  it("rejects a driver signup with an invalid phone/car format", async () => {
    const res = await request(app).post("/api/auth/driver/signup").send({
      telefone: "not-a-phone",
      carro: "12",
      nome: "Nome123",
      senha: "senha123",
      confirmarSenha: "senha123",
    });
    expect(res.status).toBe(400);
  });

  it("rejects mismatched password confirmation", async () => {
    const res = await request(app).post("/api/auth/driver/signup").send({
      telefone: "(13) 90009-0001",
      carro: "543",
      nome: "Nome Valido",
      senha: "senha123",
      confirmarSenha: "outraSenha",
    });
    expect(res.status).toBe(400);
  });
});
