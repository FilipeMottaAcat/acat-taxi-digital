import type { NextFunction, Request, Response } from "express";
import type { Admin, Driver } from "@prisma/client";
import { prisma } from "../lib/prisma.js";

export type AuthedUser =
  | { type: "admin"; admin: Admin }
  | { type: "driver"; driver: Driver };

declare global {
  // eslint-disable-next-line @typescript-eslint/no-namespace
  namespace Express {
    interface Request {
      user?: AuthedUser;
    }
  }
}

/**
 * Loads the current user fresh from the database on every request (not just from the session),
 * so a block/deactivate takes effect immediately instead of only on next login.
 */
export async function attachUser(req: Request, _res: Response, next: NextFunction) {
  const auth = req.session.auth;
  if (!auth) return next();

  if (auth.role === "admin") {
    const admin = await prisma.admin.findUnique({ where: { id: auth.id } });
    if (!admin || !admin.active) {
      req.session.auth = undefined;
      return next();
    }
    req.user = { type: "admin", admin };
  } else {
    const driver = await prisma.driver.findUnique({ where: { id: auth.id } });
    if (!driver || driver.blocked || driver.approvalStatus !== "aprovado") {
      req.session.auth = undefined;
      return next();
    }
    req.user = { type: "driver", driver };
  }
  next();
}

export function requireAuth(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    res.status(401).json({ error: "Não autenticado." });
    return;
  }
  next();
}

export function requireAdmin(req: Request, res: Response, next: NextFunction) {
  if (req.user?.type !== "admin") {
    res.status(403).json({ error: "Acesso restrito a administradores." });
    return;
  }
  next();
}

export function requireMaster(req: Request, res: Response, next: NextFunction) {
  if (req.user?.type !== "admin" || req.user.admin.role !== "admin_master") {
    res.status(403).json({ error: "Acesso restrito ao administrador master." });
    return;
  }
  next();
}

export function requireDriver(req: Request, res: Response, next: NextFunction) {
  if (req.user?.type !== "driver") {
    res.status(403).json({ error: "Acesso restrito a motoristas." });
    return;
  }
  next();
}

/** Use only in handlers guarded by requireAdmin/requireMaster — throws otherwise. */
export function currentAdmin(req: Request): Admin {
  if (req.user?.type !== "admin") throw new Error("currentAdmin() called without an authenticated admin");
  return req.user.admin;
}

/** Use only in handlers guarded by requireDriver — throws otherwise. */
export function currentDriver(req: Request): Driver {
  if (req.user?.type !== "driver") throw new Error("currentDriver() called without an authenticated driver");
  return req.user.driver;
}
