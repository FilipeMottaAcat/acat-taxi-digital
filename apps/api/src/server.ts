import { createServer } from "node:http";
import { createApp, sessionMiddleware } from "./app.js";
import { initIo } from "./realtime/io.js";
import { env } from "./lib/env.js";
import { startCidadeSweep } from "./modules/cidade/sweep.js";
import { emitAdvanceResult } from "./modules/cidade/notify.js";

const app = createApp();
const httpServer = createServer(app);
initIo(httpServer, sessionMiddleware);

const stopSweep = startCidadeSweep(emitAdvanceResult);

httpServer.listen(env.port, () => {
  console.log(`[api] listening on port ${env.port} (${env.nodeEnv})`);
});

process.on("SIGTERM", () => {
  stopSweep();
  httpServer.close();
});
