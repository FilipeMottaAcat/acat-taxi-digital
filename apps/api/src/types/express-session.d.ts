import "express-session";

declare module "express-session" {
  interface SessionData {
    auth?: { role: "admin" | "motorista"; id: string };
  }
}
