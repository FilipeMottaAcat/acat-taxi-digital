import "express-async-errors";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import session from "express-session";
import connectPgSimple from "connect-pg-simple";
import { Pool } from "pg";
import { Prisma } from "@prisma/client";
import path from "node:path";
import fs from "node:fs";
import { fileURLToPath } from "node:url";
import { env } from "./lib/env.js";
import { attachUser } from "./middleware/auth.js";
import { authRouter } from "./modules/auth/routes.js";
import { driversRouter } from "./modules/drivers/routes.js";
import { viagemRouter } from "./modules/viagem/routes.js";
import { cidadeRouter } from "./modules/cidade/routes.js";
import { pushRouter } from "./modules/push/routes.js";
import { adminsRouter } from "./modules/admins/routes.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
/** apps/api/src/../../web/dist — the built frontend, produced by `npm run build`. */
const webDistPath = path.resolve(__dirname, "../../web/dist");

const PgSession = connectPgSimple(session);

export const sessionPool = new Pool({ connectionString: env.databaseUrl });

export const sessionMiddleware = session({
  store: new PgSession({ pool: sessionPool, tableName: "session", createTableIfMissing: true }),
  secret: env.sessionSecret,
  resave: false,
  saveUninitialized: false,
  rolling: true,
  cookie: {
    httpOnly: true,
    secure: env.isProd,
    sameSite: "lax",
    maxAge: 30 * 24 * 60 * 60 * 1000, // 30 days
  },
});

export function createApp() {
  const app = express();

  app.disable("x-powered-by");
  app.use(express.json());
  app.use(sessionMiddleware);
  app.use(attachUser);

  app.get("/api/health", (_req, res) => {
    res.json({ ok: true, time: new Date().toISOString() });
  });

  app.use("/api/auth", authRouter);
  app.use("/api/drivers", driversRouter);
  app.use("/api/viagem", viagemRouter);
  app.use("/api/cidade", cidadeRouter);
  app.use("/api/push", pushRouter);
  app.use("/api/admins", adminsRouter);

  // In production the API also serves the built PWA/admin site (single Render service).
  if (env.isProd && fs.existsSync(webDistPath)) {
    app.use(express.static(webDistPath));
    app.get(/^(?!\/api).*/, (_req, res) => {
      res.sendFile(path.join(webDistPath, "index.html"));
    });
  }

  // Catches errors thrown/rejected anywhere in the routes above (express-async-errors forwards
  // async rejections here) — never let a raw stack trace or an unformatted 500 reach the client.
  app.use((err: unknown, _req: Request, res: Response, _next: NextFunction) => {
    if (err instanceof Prisma.PrismaClientKnownRequestError) {
      if (err.code === "P2025") {
        res.status(404).json({ error: "Registro não encontrado." });
        return;
      }
      if (err.code === "P2002") {
        res.status(409).json({ error: "Esse valor já está em uso." });
        return;
      }
    }
    console.error("[api] unhandled error:", err);
    res.status(500).json({ error: "Erro interno do servidor." });
  });

  return app;
}
