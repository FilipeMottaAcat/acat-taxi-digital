import { apiGet, apiPatch, apiPost } from "./api";
import type { AdminUser } from "../types";

export function listAdmins() {
  return apiGet<{ admins: AdminUser[] }>("/api/admins");
}

export function createAdmin(input: { nome: string; usuario: string; senha: string; isMaster: boolean }) {
  return apiPost<{ admin: AdminUser }>("/api/admins", input);
}

export function deactivateAdmin(id: string) {
  return apiPatch<{ admin: AdminUser }>(`/api/admins/${id}/deactivate`);
}

export function activateAdmin(id: string) {
  return apiPatch<{ admin: AdminUser }>(`/api/admins/${id}/activate`);
}
