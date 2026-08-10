import { SOCKET_EVENTS } from "@acat/shared";
import { emitToDriver, emitToEveryone } from "../../realtime/io.js";
import { pushToAllAdmins, pushToAllDrivers, pushToDriver } from "../../lib/push.js";
import type { AdvanceResult } from "./engine.js";

/** Translates an engine decision into the real-time events every connected screen reacts to. */
export function emitAdvanceResult(result: AdvanceResult) {
  if (result.type === "offered") {
    emitToDriver(result.driverId, SOCKET_EVENTS.cidadeOffered, {
      callId: result.callId,
      offerExpiresAt: result.offerExpiresAt,
    });
    emitToEveryone(SOCKET_EVENTS.cidadeQueueUpdated, {});

    void pushToDriver(result.driverId, {
      title: "Nova corrida — Cotur Cidade",
      body: "É a sua vez! Responda dentro do prazo.",
      url: "/driver/cidade",
    });
  } else {
    // Admins AND drivers, every time — the client explicitly wants repeated notification, not just once.
    emitToEveryone(SOCKET_EVENTS.cidadeWaitingForAvailable, { callId: result.callId });

    void pushToAllDrivers({
      title: "Corrida aguardando motorista",
      body: "Nenhum carro disponível no momento — fique disponível para receber essa corrida.",
      url: "/driver/cidade",
    });
    void pushToAllAdmins({
      title: "Cotur Cidade — ninguém disponível",
      body: "Uma chamada está aguardando algum motorista ficar disponível.",
      url: "/admin/cidade",
    });
  }
}
