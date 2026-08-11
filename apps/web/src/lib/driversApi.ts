import { apiDelete, apiGet, apiPatch, apiPost, apiPut } from "./api";
import type { DriverUser } from "../types";

export function listDrivers() {
  return apiGet<{ drivers: DriverUser[] }>("/api/drivers");
}

export function addDriverManually(input: { telefone: string; carro: string; nome: string }) {
  return apiPost<{ driver: DriverUser }>("/api/drivers", input);
}

export function approveDriver(id: string) {
  return apiPatch<{ driver: DriverUser }>(`/api/drivers/${id}/approve`);
}

export function rejectDriver(id: string, motivo: string) {
  return apiPatch<{ driver: DriverUser }>(`/api/drivers/${id}/reject`, { motivo });
}

export function blockDriver(id: string) {
  return apiPatch<{ driver: DriverUser }>(`/api/drivers/${id}/block`);
}

export function unblockDriver(id: string) {
  return apiPatch<{ driver: DriverUser }>(`/api/drivers/${id}/unblock`);
}

export function resetDriverPassword(id: string) {
  return apiPost<{ driver: DriverUser }>(`/api/drivers/${id}/reset-password`);
}

export function adjustTripCount(id: string, tripCount: number) {
  return apiPatch<{ driver: DriverUser }>(`/api/drivers/${id}/trip-count`, { tripCount });
}

export function resetAllTripCounts() {
  return apiPost<{ drivers: DriverUser[] }>("/api/drivers/trip-count/reset-all");
}

export function setPriorityOrder(driverIds: string[]) {
  return apiPut<{ drivers: DriverUser[] }>("/api/drivers/priority-order", { driverIds });
}

export function deleteDriver(id: string, motivo?: string) {
  return apiDelete<void>(`/api/drivers/${id}`, motivo ? { motivo } : undefined);
}

export interface DeletionHistoryEntry {
  id: string;
  carNumber: string;
  name: string;
  phone: string;
  tripCount: number;
  reason: string | null;
  deletedAt: string;
}

export function getDeletionHistory() {
  return apiGet<{ history: DeletionHistoryEntry[] }>("/api/drivers/deletion-history");
}

export interface PasswordResetRequestEntry {
  id: string;
  createdAt: string;
  driver: DriverUser;
}

export function getPasswordResetRequests() {
  return apiGet<{ requests: PasswordResetRequestEntry[] }>("/api/drivers/password-reset-requests");
}

export function updateOwnStatus(status: "disponivel" | "indisponivel") {
  return apiPatch<{ driver: DriverUser }>("/api/drivers/me/status", { status });
}

export function requestOwnPasswordReset() {
  return apiPost<{ request: { id: string; createdAt: string } }>("/api/drivers/me/request-password-reset");
}
