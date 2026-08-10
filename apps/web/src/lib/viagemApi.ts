import { apiGet, apiPost } from "./api";
import type { DriverUser } from "../types";

export interface ViagemCall {
  id: string;
  status: "aberto" | "concluido" | "cancelado";
  tripDate: string;
  city: string;
  time: string;
  createdByAdminId: string;
  createdAt: string;
  acceptedCarSnap: string | null;
  acceptedNameSnap: string | null;
  acceptedAt: string | null;
  cancelledAt: string | null;
}

export function getViagemQueue() {
  return apiGet<{ queue: DriverUser[] }>("/api/viagem/queue");
}

export function getViagemCurrent() {
  return apiGet<{ call: ViagemCall | null; nextDriver: DriverUser | null }>("/api/viagem/current");
}

export function getViagemHistory() {
  return apiGet<{ calls: ViagemCall[] }>("/api/viagem/history");
}

export function createViagemRequest(input: { data: string; cidade: string; horario: string }) {
  return apiPost<{ call: ViagemCall; nextDriver: DriverUser }>("/api/viagem/requests", input);
}

export function acceptViagemRequest(id: string) {
  return apiPost<{ call: ViagemCall }>(`/api/viagem/requests/${id}/aceitar`);
}

export function cancelViagemRequest(id: string) {
  return apiPost<{ call: ViagemCall }>(`/api/viagem/requests/${id}/cancelar`);
}
