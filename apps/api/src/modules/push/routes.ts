import { Router } from "express";
import { z } from "zod";
import { pushSubscribeSchema } from "@acat/shared";
import { prisma } from "../../lib/prisma.js";
import { env } from "../../lib/env.js";
import { validateBody } from "../../middleware/validate.js";
import { requireAuth } from "../../middleware/auth.js";

export const pushRouter = Router();

pushRouter.get("/vapid-public-key", (_req, res) => {
  res.json({ publicKey: env.webPush.publicKey });
});

pushRouter.use(requireAuth);

pushRouter.post("/subscribe", validateBody(pushSubscribeSchema), async (req, res) => {
  const { endpoint, keys } = req.body as z.infer<typeof pushSubscribeSchema>;
  const auth = req.session.auth!;

  await prisma.pushSubscription.upsert({
    where: { endpoint },
    update: { userType: auth.role === "admin" ? "admin" : "driver", userId: auth.id, p256dh: keys.p256dh, auth: keys.auth },
    create: {
      endpoint,
      userType: auth.role === "admin" ? "admin" : "driver",
      userId: auth.id,
      p256dh: keys.p256dh,
      auth: keys.auth,
    },
  });

  res.status(201).end();
});

const unsubscribeSchema = z.object({ endpoint: z.string().url() });

pushRouter.delete("/subscribe", validateBody(unsubscribeSchema), async (req, res) => {
  const { endpoint } = req.body as z.infer<typeof unsubscribeSchema>;
  await prisma.pushSubscription.deleteMany({ where: { endpoint } });
  res.status(204).end();
});
