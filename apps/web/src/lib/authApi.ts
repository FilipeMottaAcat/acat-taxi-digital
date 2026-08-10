import { apiGet, apiPost } from "./api";
import type { AdminUser, DriverUser } from "../types";

export function getBootstrapStatus() {
  return apiGet<{ needsBootstrap: boolean }>("/api/auth/bootstrap-status");
}

export function bootstrapMaster(input: { nome: string; usuario: string; senha: string }) {
  return apiPost<{ admin: AdminUser }>("/api/auth/admin/bootstrap", input);
}

export function adminLogin(input: { usuario: string; senha: string }) {
  return apiPost<{ admin: AdminUser }>("/api/auth/admin/login", input);
}

export function driverCheck(telefone: string) {
  return apiPost<{
    found: boolean;
    blocked?: boolean;
    approvalStatus?: "pendente" | "aprovado" | "rejeitado";
    rejectionReason?: string | null;
    mustSetPassword?: boolean;
  }>("/api/auth/driver/check", { telefone });
}

export function driverLogin(input: { telefone: string; senha: string }) {
  return apiPost<{ driver: DriverUser }>("/api/auth/driver/login", input);
}

export function driverSignup(input: {
  telefone: string;
  carro: string;
  nome: string;
  senha: string;
  confirmarSenha: string;
}) {
  return apiPost<{ driver: DriverUser; message: string }>("/api/auth/driver/signup", input);
}

export function setDriverPassword(input: { telefone: string; senha: string; confirmarSenha: string }) {
  return apiPost<{ driver: DriverUser }>("/api/auth/set-password", input);
}

export function logout() {
  return apiPost<void>("/api/auth/logout");
}
