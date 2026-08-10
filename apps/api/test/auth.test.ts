import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

const app = createApp();

describe("bootstrap", () => {
  it("reports needsBootstrap=true when there are no admins", async () => {
    const res = await request(app).get("/api/auth/bootstrap-status");
    expect(res.status).toBe(200);
    expect(res.body.needsBootstrap).toBe(true);
  });

  it("creates the first admin as master and logs them in", async () => {
    const agent = request.agent(app);
    const res = await agent
      .post("/api/auth/admin/bootstrap")
      .send({ nome: "Ana Master", usuario: "ana", senha: "senha123" });

    expect(res.status).toBe(201);
    expect(res.body.admin.role).toBe("admin_master");

    const me = await agent.get("/api/auth/me");
    expect(me.body.user.type).toBe("admin");
    expect(me.body.user.usuario).toBe("ana");
  });

  it("refuses to bootstrap a second master once one exists", async () => {
    await prisma.admin.create({
      data: { nome: "X", usuario: "x", passwordHash: await hashPassword("senha123"), role: "admin_master" },
    });

    const res = await request(app)
      .post("/api/auth/admin/bootstrap")
      .send({ nome: "Y", usuario: "yolanda", senha: "senha123" });

    expect(res.status).toBe(409);
  });
});

describe("admin login", () => {
  it("logs in with correct credentials", async () => {
    await prisma.admin.create({
      data: { nome: "Ana", usuario: "ana", passwordHash: await hashPassword("senha123"), role: "admin_master" },
    });

    const res = await request(app).post("/api/auth/admin/login").send({ usuario: "ana", senha: "senha123" });
    expect(res.status).toBe(200);
    expect(res.body.admin.usuario).toBe("ana");
  });

  it("rejects wrong password", async () => {
    await prisma.admin.create({
      data: { nome: "Ana", usuario: "ana", passwordHash: await hashPassword("senha123"), role: "admin_master" },
    });

    const res = await request(app).post("/api/auth/admin/login").send({ usuario: "ana", senha: "errada" });
    expect(res.status).toBe(401);
  });

  it("rejects unknown user", async () => {
    const res = await request(app).post("/api/auth/admin/login").send({ usuario: "ninguem", senha: "senha123" });
    expect(res.status).toBe(401);
  });
});

describe("driver signup + approval gating", () => {
  it("creates a pending driver and blocks login until approved", async () => {
    const signup = await request(app).post("/api/auth/driver/signup").send({
      telefone: "(13) 90000-0001",
      carro: "543",
      nome: "João Silva",
      senha: "senha123",
      confirmarSenha: "senha123",
    });
    expect(signup.status).toBe(201);
    expect(signup.body.driver.approvalStatus).toBe("pendente");

    const login = await request(app)
      .post("/api/auth/driver/login")
      .send({ telefone: "(13) 90000-0001", senha: "senha123" });
    expect(login.status).toBe(403);
    expect(login.body.error).toMatch(/aguardando aprovação/);
  });

  it("rejects a signup with a duplicate phone", async () => {
    await request(app).post("/api/auth/driver/signup").send({
      telefone: "(13) 90000-0002",
      carro: "519",
      nome: "Bruno",
      senha: "senha123",
      confirmarSenha: "senha123",
    });
    const dup = await request(app).post("/api/auth/driver/signup").send({
      telefone: "(13) 90000-0002",
      carro: "529",
      nome: "Carlos",
      senha: "senha123",
      confirmarSenha: "senha123",
    });
    expect(dup.status).toBe(409);
  });

  it("lets an approved driver log in, and blocks a blocked driver", async () => {
    const driver = await prisma.driver.create({
      data: {
        carNumber: "543",
        name: "João Silva",
        phone: "(13) 90000-0003",
        passwordHash: await hashPassword("senha123"),
        mustSetPassword: false,
        approvalStatus: "aprovado",
      },
    });

    const ok = await request(app)
      .post("/api/auth/driver/login")
      .send({ telefone: "(13) 90000-0003", senha: "senha123" });
    expect(ok.status).toBe(200);

    await prisma.driver.update({ where: { id: driver.id }, data: { blocked: true } });

    const blocked = await request(app)
      .post("/api/auth/driver/login")
      .send({ telefone: "(13) 90000-0003", senha: "senha123" });
    expect(blocked.status).toBe(403);
    expect(blocked.body.error).toMatch(/bloqueado/);
  });

  it("shows the rejection reason on login when rejected", async () => {
    await prisma.driver.create({
      data: {
        carNumber: "543",
        name: "João Silva",
        phone: "(13) 90000-0004",
        passwordHash: await hashPassword("senha123"),
        mustSetPassword: false,
        approvalStatus: "rejeitado",
        rejectionReason: "Documentação incompleta",
      },
    });

    const res = await request(app)
      .post("/api/auth/driver/login")
      .send({ telefone: "(13) 90000-0004", senha: "senha123" });
    expect(res.status).toBe(403);
    expect(res.body.error).toMatch(/Documentação incompleta/);
  });
});

describe("set-password (first login / post-reset)", () => {
  it("requires set-password when passwordHash is null, then logs in normally after", async () => {
    await prisma.driver.create({
      data: {
        carNumber: "543",
        name: "João Silva",
        phone: "(13) 90000-0005",
        passwordHash: null,
        mustSetPassword: true,
        approvalStatus: "aprovado",
      },
    });

    const check = await request(app).post("/api/auth/driver/check").send({ telefone: "(13) 90000-0005" });
    expect(check.body.mustSetPassword).toBe(true);

    const blockedLogin = await request(app)
      .post("/api/auth/driver/login")
      .send({ telefone: "(13) 90000-0005", senha: "qualquer" });
    expect(blockedLogin.status).toBe(409);

    const setPw = await request(app).post("/api/auth/set-password").send({
      telefone: "(13) 90000-0005",
      senha: "novaSenha1",
      confirmarSenha: "novaSenha1",
    });
    expect(setPw.status).toBe(200);

    const login = await request(app)
      .post("/api/auth/driver/login")
      .send({ telefone: "(13) 90000-0005", senha: "novaSenha1" });
    expect(login.status).toBe(200);
  });
});

describe("blocked admin/driver is rejected on every request, not just at login", () => {
  it("deactivating an admin mid-session cuts off access on the next request", async () => {
    const agent = request.agent(app);
    const admin = await prisma.admin.create({
      data: { nome: "Ana", usuario: "ana", passwordHash: await hashPassword("senha123"), role: "admin_master" },
    });
    await agent.post("/api/auth/admin/login").send({ usuario: "ana", senha: "senha123" });

    let me = await agent.get("/api/auth/me");
    expect(me.body.user.type).toBe("admin");

    await prisma.admin.update({ where: { id: admin.id }, data: { active: false } });

    me = await agent.get("/api/auth/me");
    expect(me.body.user).toBeNull();
  });
});
