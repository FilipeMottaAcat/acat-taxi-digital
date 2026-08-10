import { apiGet, apiPost } from "./api";
import type { DriverUser } from "../types";

export interface CidadeCall {
  id: string;
  type: "agendada" | "momento";
  status: "offering" | "waiting_for_available" | "concluido" | "cancelado";
  tripDate: string;
  city: string;
  time: string;
  candidateDriverId: string | null;
  offerExpiresAt: string | null;
  createdByAdminId: string;
  createdAt: string;
  acceptedCarSnap: string | null;
  acceptedNameSnap: string | null;
  acceptedAt: string | null;
  cancelledAt: string | null;
}

export interface CidadeEvent {
  id: string;
  callId: string;
  type: "offered" | "accepted" | "declined" | "timed_out" | "entered_waiting" | "cancelled";
  driverId: string | null;
  carSnap: string | null;
  nameSnap: string | null;
  createdAt: string;
}

export function getCidadeQueue() {
  return apiGet<{ queue: DriverUser[] }>("/api/cidade/queue");
}

export function getCidadeCurrent() {
  return apiGet<{ call: CidadeCall | null; candidate: DriverUser | null }>("/api/cidade/current");
}

export function getCidadeHistory() {
  return apiGet<{ calls: CidadeCall[] }>("/api/cidade/history");
}

export function getCidadeEvents(callId: string) {
  return apiGet<{ events: CidadeEvent[] }>(`/api/cidade/calls/${callId}/events`);
}

export function createCidadeCall(input: { data: string; cidade: string; horario: string; type: "agendada" | "momento" }) {
  return apiPost<{ call: CidadeCall }>("/api/cidade/calls", input);
}

export function acceptCidadeCall(id: string) {
  return apiPost<{ call: CidadeCall }>(`/api/cidade/calls/${id}/aceitar`);
}

export function declineCidadeCall(id: string) {
  return apiPost<void>(`/api/cidade/calls/${id}/recusar`);
}

export function cancelCidadeCall(id: string) {
  return apiPost<{ call: CidadeCall }>(`/api/cidade/calls/${id}/cancelar`);
}
