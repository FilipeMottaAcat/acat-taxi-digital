import { Router } from "express";
import { z } from "zod";
import { createAdminSchema } from "@acat/shared";
import { prisma } from "../../lib/prisma.js";
import { validateBody } from "../../middleware/validate.js";
import { currentAdmin, requireMaster } from "../../middleware/auth.js";
import { publicAdmin } from "../../lib/dto.js";
import { hashPassword } from "../../lib/password.js";

export const adminsRouter = Router();
adminsRouter.use(requireMaster);

adminsRouter.get("/", async (_req, res) => {
  const admins = await prisma.admin.findMany({ orderBy: { createdAt: "asc" } });
  res.json({ admins: admins.map(publicAdmin) });
});

adminsRouter.post("/", validateBody(createAdminSchema), async (req, res) => {
  const { nome, usuario, senha, isMaster } = req.body as z.infer<typeof createAdminSchema>;

  const existing = await prisma.admin.findUnique({ where: { usuario } });
  if (existing) {
    res.status(409).json({ error: "Esse nome de usuário já está em uso." });
    return;
  }

  const passwordHash = await hashPassword(senha);
  const admin = await prisma.admin.create({
    data: {
      nome,
      usuario,
      passwordHash,
      role: isMaster ? "admin_master" : "admin_comum",
      createdById: currentAdmin(req).id,
    },
  });

  res.status(201).json({ admin: publicAdmin(admin) });
});

adminsRouter.patch("/:id/deactivate", async (req, res) => {
  const requester = currentAdmin(req);
  if (req.params.id === requester.id) {
    res.status(400).json({ error: "Você não pode desativar seu próprio acesso." });
    return;
  }

  const target = await prisma.admin.findUnique({ where: { id: req.params.id } });
  if (!target) {
    res.status(404).json({ error: "Administrador não encontrado." });
    return;
  }

  const updated = await prisma.admin.update({ where: { id: target.id }, data: { active: false } });
  res.json({ admin: publicAdmin(updated) });
});

adminsRouter.patch("/:id/activate", async (req, res) => {
  const updated = await prisma.admin.update({ where: { id: req.params.id }, data: { active: true } });
  res.json({ admin: publicAdmin(updated) });
});
