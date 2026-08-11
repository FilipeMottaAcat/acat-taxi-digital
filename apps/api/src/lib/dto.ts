import type {
  Admin,
  CoturCidadeCall,
  CoturCidadeCallEvent,
  CoturCidadeCallResponse,
  CoturViagemCall,
  Driver,
} from "@prisma/client";

export function publicAdmin(admin: Admin) {
  return {
    id: admin.id,
    nome: admin.nome,
    usuario: admin.usuario,
    role: admin.role,
    active: admin.active,
    createdAt: admin.createdAt,
  };
}
export type PublicAdmin = ReturnType<typeof publicAdmin>;

export function publicDriver(driver: Driver) {
  return {
    id: driver.id,
    carNumber: driver.carNumber,
    name: driver.name,
    phone: driver.phone,
    mustSetPassword: driver.mustSetPassword,
    approvalStatus: driver.approvalStatus,
    rejectionReason: driver.rejectionReason,
    blocked: driver.blocked,
    operationalStatus: driver.operationalStatus,
    tripCount: driver.tripCount,
    priorityRank: driver.priorityRank,
    createdAt: driver.createdAt,
  };
}
export type PublicDriver = ReturnType<typeof publicDriver>;

export function publicViagemCall(call: CoturViagemCall) {
  return {
    id: call.id,
    status: call.status,
    tripDate: call.tripDate,
    city: call.city,
    time: call.time,
    createdByAdminId: call.createdByAdminId,
    createdAt: call.createdAt,
    acceptedCarSnap: call.acceptedCarSnap,
    acceptedNameSnap: call.acceptedNameSnap,
    acceptedAt: call.acceptedAt,
    cancelledAt: call.cancelledAt,
  };
}
export type PublicViagemCall = ReturnType<typeof publicViagemCall>;

export function publicCidadeCall(call: CoturCidadeCall) {
  return {
    id: call.id,
    type: call.type,
    status: call.status,
    tripDate: call.tripDate,
    city: call.city,
    time: call.time,
    candidateDriverId: call.candidateDriverId,
    offerExpiresAt: call.offerExpiresAt,
    createdByAdminId: call.createdByAdminId,
    createdAt: call.createdAt,
    acceptedCarSnap: call.acceptedCarSnap,
    acceptedNameSnap: call.acceptedNameSnap,
    acceptedAt: call.acceptedAt,
    cancelledAt: call.cancelledAt,
  };
}
export type PublicCidadeCall = ReturnType<typeof publicCidadeCall>;

export function publicCidadeEvent(event: CoturCidadeCallEvent) {
  return {
    id: event.id,
    callId: event.callId,
    type: event.type,
    driverId: event.driverId,
    carSnap: event.carSnap,
    nameSnap: event.nameSnap,
    createdAt: event.createdAt,
  };
}
export type PublicCidadeEvent = ReturnType<typeof publicCidadeEvent>;

export function publicCidadeResponse(response: CoturCidadeCallResponse) {
  return {
    driverId: response.driverId,
    response: response.response,
    updatedAt: response.updatedAt,
  };
}
export type PublicCidadeResponse = ReturnType<typeof publicCidadeResponse>;
