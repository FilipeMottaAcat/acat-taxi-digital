import { describe, expect, it } from "vitest";
import request from "supertest";
import { createApp } from "../src/app.js";
import { prisma } from "../src/lib/prisma.js";
import { hashPassword } from "../src/lib/password.js";

const app = createApp();

describe("vapid public key", () => {
  it("is publicly readable without auth", async () => {
    const res = await request(app).get("/api/push/vapid-public-key");
    expect(res.status).toBe(200);
    expect(res.body).toHaveProperty("publicKey");
  });
});

describe("subscribe / unsubscribe", () => {
  it("requires auth", async () => {
    const res = await request(app)
      .post("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/abc", keys: { p256dh: "x", auth: "y" } });
    expect(res.status).toBe(401);
  });

  it("lets an authenticated driver subscribe, upserts on re-subscribe, and unsubscribe removes it", async () => {
    const driver = await prisma.driver.create({
      data: {
        carNumber: "543",
        name: "Motorista",
        phone: "(13) 90003-0001",
        passwordHash: await hashPassword("senha123"),
        mustSetPassword: false,
        approvalStatus: "aprovado",
      },
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/driver/login").send({ telefone: driver.phone, senha: "senha123" });

    const sub = await agent
      .post("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/driver1", keys: { p256dh: "x", auth: "y" } });
    expect(sub.status).toBe(201);

    const stored = await prisma.pushSubscription.findUnique({ where: { endpoint: "https://push.example.com/driver1" } });
    expect(stored?.userType).toBe("driver");
    expect(stored?.userId).toBe(driver.id);

    // Re-subscribing with the same endpoint (e.g. browser re-registers) upserts, not duplicates.
    await agent
      .post("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/driver1", keys: { p256dh: "x2", auth: "y2" } });
    const count = await prisma.pushSubscription.count({ where: { endpoint: "https://push.example.com/driver1" } });
    expect(count).toBe(1);

    const unsub = await agent.delete("/api/push/subscribe").send({ endpoint: "https://push.example.com/driver1" });
    expect(unsub.status).toBe(204);
    const gone = await prisma.pushSubscription.findUnique({ where: { endpoint: "https://push.example.com/driver1" } });
    expect(gone).toBeNull();
  });

  it("tags an admin subscription with userType=admin", async () => {
    await prisma.admin.create({
      data: { nome: "Ana", usuario: "ana", passwordHash: await hashPassword("senha123"), role: "admin_master" },
    });
    const agent = request.agent(app);
    await agent.post("/api/auth/admin/login").send({ usuario: "ana", senha: "senha123" });

    await agent
      .post("/api/push/subscribe")
      .send({ endpoint: "https://push.example.com/admin1", keys: { p256dh: "x", auth: "y" } });

    const stored = await prisma.pushSubscription.findUnique({ where: { endpoint: "https://push.example.com/admin1" } });
    expect(stored?.userType).toBe("admin");
  });
});
