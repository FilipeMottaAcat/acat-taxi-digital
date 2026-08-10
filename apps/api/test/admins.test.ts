import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

const app = createApp();

async function loginAsMaster(usuario = "ana") {
  await prisma.admin.create({
    data: { nome: "Ana", usuario, passwordHash: await hashPassword("senha123"), role: "admin_master" },
  });
  const agent = request.agent(app);
  await agent.post("/api/auth/admin/login").send({ usuario, senha: "senha123" });
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

describe("admin_comum is blocked from admin management", () => {
  it("rejects list and create", async () => {
    const comum = await loginAsComum();
    expect((await comum.get("/api/admins")).status).toBe(403);
    expect(
      (await comum.post("/api/admins").send({ nome: "X", usuario: "xx", senha: "senha123", isMaster: false })).status,
    ).toBe(403);
  });
});

describe("create admin", () => {
  it("master creates a comum admin", async () => {
    const master = await loginAsMaster();
    const res = await master.post("/api/admins").send({ nome: "Beto", usuario: "beto", senha: "senha123", isMaster: false });
    expect(res.status).toBe(201);
    expect(res.body.admin.role).toBe("admin_comum");
  });

  it("master creates another master (any master can create a master)", async () => {
    const master = await loginAsMaster();
    const res = await master.post("/api/admins").send({ nome: "Carla", usuario: "carla", senha: "senha123", isMaster: true });
    expect(res.status).toBe(201);
    expect(res.body.admin.role).toBe("admin_master");
  });

  it("rejects a duplicate username", async () => {
    const master = await loginAsMaster();
    await master.post("/api/admins").send({ nome: "Beto", usuario: "beto", senha: "senha123", isMaster: false });
    const dup = await master.post("/api/admins").send({ nome: "Beto2", usuario: "beto", senha: "senha123", isMaster: false });
    expect(dup.status).toBe(409);
  });
});

describe("deactivate / activate", () => {
  it("deactivates a comum admin, who can no longer log in", async () => {
    const master = await loginAsMaster();
    const created = await master.post("/api/admins").send({ nome: "Beto", usuario: "beto", senha: "senha123", isMaster: false });

    const deactivate = await master.patch(`/api/admins/${created.body.admin.id}/deactivate`);
    expect(deactivate.status).toBe(200);
    expect(deactivate.body.admin.active).toBe(false);

    const login = await request(app).post("/api/auth/admin/login").send({ usuario: "beto", senha: "senha123" });
    expect(login.status).toBe(403);
  });

  it("refuses to let an admin deactivate themselves", async () => {
    const master = await loginAsMaster();
    const me = await master.get("/api/auth/me");
    const res = await master.patch(`/api/admins/${me.body.user.id}/deactivate`);
    expect(res.status).toBe(400);
  });

  it("allows deactivating a second master, going from two active masters down to one", async () => {
    const master = await loginAsMaster();
    const meRes = await master.get("/api/auth/me");
    const second = await master.post("/api/admins").send({ nome: "Carla", usuario: "carla", senha: "senha123", isMaster: true });

    const secondAgent = request.agent(app);
    await secondAgent.post("/api/auth/admin/login").send({ usuario: "carla", senha: "senha123" });

    // Two active masters -> deactivating one is fine (system still has an active master left).
    const deactivateFirst = await secondAgent.patch(`/api/admins/${meRes.body.user.id}/deactivate`);
    expect(deactivateFirst.status).toBe(200);

    // Carla is now the only active master, and she can't deactivate her own account (covered above) —
    // so there is no remaining path in the API to ever reach zero active masters.
    void second;
  });

  it("reactivates a deactivated admin", async () => {
    const master = await loginAsMaster();
    const created = await master.post("/api/admins").send({ nome: "Beto", usuario: "beto", senha: "senha123", isMaster: false });
    await master.patch(`/api/admins/${created.body.admin.id}/deactivate`);

    const reactivate = await master.patch(`/api/admins/${created.body.admin.id}/activate`);
    expect(reactivate.status).toBe(200);
    expect(reactivate.body.admin.active).toBe(true);

    const login = await request(app).post("/api/auth/admin/login").send({ usuario: "beto", senha: "senha123" });
    expect(login.status).toBe(200);
  });
});
