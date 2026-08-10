import rateLimit from "express-rate-limit";
import { env } from "../lib/env.js";

/** Guards login/signup endpoints against brute-force and spam — generous enough for real typos. */
export const authRateLimit = rateLimit({
  windowMs: 15 * 60 * 1000,
  limit: 20,
  standardHeaders: true,
  legacyHeaders: false,
  // The test suite legitimately makes far more than 20 auth calls per run against one in-process "IP".
  skip: () => env.nodeEnv === "test",
  message: { error: "Muitas tentativas. Aguarde alguns minutos e tente de novo." },
});
