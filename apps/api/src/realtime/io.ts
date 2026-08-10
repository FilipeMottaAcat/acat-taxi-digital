import type { Server as HttpServer } from "node:http";
import { Server as SocketIOServer } from "socket.io";
import type { RequestHandler } from "express";

let io: SocketIOServer | undefined;

/** Wraps express middleware so Socket.io's handshake shares the same session as REST requests. */
function wrap(middleware: RequestHandler) {
  return (socket: import("socket.io").Socket, next: (err?: Error) => void) => {
    middleware(socket.request as any, {} as any, next as any);
  };
}

export function initIo(server: HttpServer, sessionMiddleware: RequestHandler) {
  io = new SocketIOServer(server, {
    cors: { origin: true, credentials: true },
  });

  io.use(wrap(sessionMiddleware));

  io.on("connection", (socket) => {
    const session = (socket.request as any).session;
    const auth = session?.auth as { role: "admin" | "motorista"; id: string } | undefined;

    if (!auth) {
      socket.disconnect(true);
      return;
    }

    if (auth.role === "admin") {
      socket.join("role:admin");
    } else {
      socket.join("role:driver");
      socket.join(`driver:${auth.id}`);
    }
  });

  return io;
}

export function getIo(): SocketIOServer {
  if (!io) throw new Error("Socket.io not initialized yet");
  return io;
}

/**
 * These emit helpers are no-ops when Socket.io hasn't been initialized (e.g. in tests that exercise
 * the Express app directly via supertest, without booting the HTTP+socket server) rather than throwing —
 * real-time updates are a bonus for connected clients, never a requirement for the REST action to succeed.
 */

/** Broadcasts to every connected admin and driver — use for queue/state changes everyone should see. */
export function emitToEveryone(event: string, payload?: unknown) {
  io?.to("role:admin").to("role:driver").emit(event, payload);
}

/** Notifies a single driver — use for direct offers/alerts (SLA offer, push-worthy events). */
export function emitToDriver(driverId: string, event: string, payload?: unknown) {
  io?.to(`driver:${driverId}`).emit(event, payload);
}

/** Notifies all admins — use for admin-only alerts (waiting-for-available, password reset requests). */
export function emitToAdmins(event: string, payload?: unknown) {
  io?.to("role:admin").emit(event, payload);
}
