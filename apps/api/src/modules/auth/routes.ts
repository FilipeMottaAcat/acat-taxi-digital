import { Router } from "express";
import {
  bootstrapMasterSchema,
  adminLoginSchema,
  driverSignupSchema,
  driverLoginSchema,
  setDriverPasswordSchema,
} from "@acat/shared";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { hashPassword, verifyPassword } from "../../lib/password.js";
import { publicAdmin, publicDriver } from "../../lib/dto.js";
import { validateBody } from "../../middleware/validate.js";
import { authRateLimit } from "../../middleware/rateLimit.js";

export const authRouter = Router();

authRouter.get("/bootstrap-status", async (_req, res) => {
  const count = await prisma.admin.count();
  res.json({ needsBootstrap: count === 0 });
});

authRouter.post("/admin/bootstrap", authRateLimit, validateBody(bootstrapMasterSchema), async (req, res) => {
  const count = await prisma.admin.count();
  if (count > 0) {
    res.status(409).json({ error: "Já existe um administrador cadastrado." });
    return;
  }

  const { nome, usuario, senha } = req.body as z.infer<typeof bootstrapMasterSchema>;
  const passwordHash = await hashPassword(senha);
  const admin = await prisma.admin.create({
    data: { nome, usuario, passwordHash, role: "admin_master" },
  });

  req.session.auth = { role: "admin", id: admin.id };
  res.status(201).json({ admin: publicAdmin(admin) });
});

authRouter.post("/admin/login", authRateLimit, validateBody(adminLoginSchema), async (req, res) => {
  const { usuario, senha } = req.body as z.infer<typeof adminLoginSchema>;

  const admin = await prisma.admin.findUnique({ where: { usuario } });
  if (!admin) {
    res.status(401).json({ error: "Usuário não encontrado." });
    return;
  }
  if (!admin.active) {
    res.status(403).json({ error: "Este acesso foi desativado." });
    return;
  }
  const ok = await verifyPassword(senha, admin.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Senha incorreta." });
    return;
  }

  req.session.auth = { role: "admin", id: admin.id };
  res.json({ admin: publicAdmin(admin) });
});

authRouter.post("/driver/signup", authRateLimit, validateBody(driverSignupSchema), async (req, res) => {
  const { telefone, carro, nome, senha } = req.body as z.infer<typeof driverSignupSchema>;

  const [existingPhone, existingCar] = await Promise.all([
    prisma.driver.findUnique({ where: { phone: telefone } }),
    prisma.driver.findUnique({ where: { carNumber: carro } }),
  ]);
  if (existingPhone) {
    res.status(409).json({ error: "Esse telefone já tem um cadastro." });
    return;
  }
  if (existingCar) {
    res.status(409).json({ error: "Já existe um cadastro para esse número de carro." });
    return;
  }

  const passwordHash = await hashPassword(senha);
  const driver = await prisma.driver.create({
    data: {
      carNumber: carro,
      name: nome,
      phone: telefone,
      passwordHash,
      mustSetPassword: false,
      approvalStatus: "pendente",
    },
  });

  res.status(201).json({
    driver: publicDriver(driver),
    message: "Cadastro enviado! Aguarde a aprovação do administrador master.",
  });
});

const driverCheckSchema = z.object({ telefone: z.string().min(1) });

authRouter.post("/driver/check", validateBody(driverCheckSchema), async (req, res) => {
  const { telefone } = req.body as z.infer<typeof driverCheckSchema>;
  const driver = await prisma.driver.findUnique({ where: { phone: telefone } });
  if (!driver) {
    res.json({ found: false });
    return;
  }
  res.json({
    found: true,
    blocked: driver.blocked,
    approvalStatus: driver.approvalStatus,
    rejectionReason: driver.approvalStatus === "rejeitado" ? driver.rejectionReason : null,
    mustSetPassword: driver.mustSetPassword || !driver.passwordHash,
  });
});

authRouter.post("/driver/login", authRateLimit, validateBody(driverLoginSchema), async (req, res) => {
  const { telefone, senha } = req.body as z.infer<typeof driverLoginSchema>;

  const driver = await prisma.driver.findUnique({ where: { phone: telefone } });
  if (!driver) {
    res.status(401).json({ error: 'Telefone não cadastrado. Use "Primeiro acesso" para se cadastrar.' });
    return;
  }
  if (driver.blocked) {
    res.status(403).json({ error: "Seu acesso foi bloqueado. Fale com o administrador." });
    return;
  }
  if (driver.approvalStatus === "pendente") {
    res.status(403).json({ error: "Seu cadastro ainda está aguardando aprovação do administrador master." });
    return;
  }
  if (driver.approvalStatus === "rejeitado") {
    res.status(403).json({
      error: `Seu cadastro foi recusado. Motivo: ${driver.rejectionReason ?? "não informado"}`,
    });
    return;
  }
  if (driver.mustSetPassword || !driver.passwordHash) {
    res.status(409).json({ error: "Você precisa criar uma nova senha antes de entrar.", mustSetPassword: true });
    return;
  }

  const ok = await verifyPassword(senha, driver.passwordHash);
  if (!ok) {
    res.status(401).json({ error: "Senha incorreta." });
    return;
  }

  req.session.auth = { role: "motorista", id: driver.id };
  res.json({ driver: publicDriver(driver) });
});

authRouter.post("/set-password", authRateLimit, validateBody(setDriverPasswordSchema), async (req, res) => {
  const { telefone, senha } = req.body as z.infer<typeof setDriverPasswordSchema>;

  const driver = await prisma.driver.findUnique({ where: { phone: telefone } });
  if (!driver) {
    res.status(404).json({ error: "Motorista não encontrado." });
    return;
  }
  if (driver.blocked) {
    res.status(403).json({ error: "Seu acesso foi bloqueado. Fale com o administrador." });
    return;
  }
  if (!driver.mustSetPassword && driver.passwordHash) {
    res.status(409).json({ error: "Este motorista já tem uma senha definida." });
    return;
  }

  const passwordHash = await hashPassword(senha);
  const updated = await prisma.driver.update({
    where: { id: driver.id },
    data: { passwordHash, mustSetPassword: false },
  });

  req.session.auth = { role: "motorista", id: updated.id };
  res.json({ driver: publicDriver(updated) });
});

authRouter.post("/logout", (req, res) => {
  req.session.destroy(() => {
    res.status(204).end();
  });
});

authRouter.get("/me", async (req, res) => {
  if (!req.user) {
    res.json({ user: null });
    return;
  }
  if (req.user.type === "admin") {
    res.json({ user: { type: "admin", ...publicAdmin(req.user.admin) } });
  } else {
    res.json({ user: { type: "driver", ...publicDriver(req.user.driver) } });
  }
});
