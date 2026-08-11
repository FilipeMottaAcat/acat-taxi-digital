export const ADMIN_ROLES = ["admin_master", "admin_comum"] as const;
export type AdminRole = (typeof ADMIN_ROLES)[number];

export const APPROVAL_STATUSES = ["pendente", "aprovado", "rejeitado", "bloqueado"] as const;
export type ApprovalStatus = (typeof APPROVAL_STATUSES)[number];

export const OPERATIONAL_STATUSES = ["disponivel", "indisponivel", "em_viagem"] as const;
export type OperationalStatus = (typeof OPERATIONAL_STATUSES)[number];

export const VIAGEM_CALL_STATUSES = ["aberto", "concluido", "cancelado"] as const;
export type ViagemCallStatus = (typeof VIAGEM_CALL_STATUSES)[number];

export const CIDADE_CALL_TYPES = ["agendada", "momento"] as const;
export type CidadeCallType = (typeof CIDADE_CALL_TYPES)[number];

export const CIDADE_CALL_STATUSES = [
  "offering",
  "waiting_for_available",
  "concluido",
  "cancelado",
] as const;
export type CidadeCallStatus = (typeof CIDADE_CALL_STATUSES)[number];

export const CIDADE_EVENT_TYPES = [
  "offered",
  "accepted",
  "declined",
  "timed_out",
  "entered_waiting",
  "cancelled",
] as const;
export type CidadeEventType = (typeof CIDADE_EVENT_TYPES)[number];

/** A driver's early self-reported answer for a call that isn't their official turn yet. */
export const CIDADE_RESPONSE_TYPES = ["disponivel", "indisponivel"] as const;
export type CidadeResponseType = (typeof CIDADE_RESPONSE_TYPES)[number];

/** SLA duration in minutes per Cotur Cidade call type. */
export const CIDADE_SLA_MINUTES: Record<CidadeCallType, number> = {
  agendada: 30,
  momento: 10,
};

/** Server-side sweep interval for the Cotur Cidade expiry engine, in milliseconds. */
export const CIDADE_SWEEP_INTERVAL_MS = 2000;

export const MIN_PASSWORD_LENGTH = 6;

/** Socket.io event names, shared so client/server never drift. */
export const SOCKET_EVENTS = {
  viagemQueueUpdated: "viagem:queue_updated",
  viagemRequestCreated: "viagem:request_created",
  viagemRequestClosed: "viagem:request_closed",
  cidadeCallCreated: "cidade:call_created",
  cidadeOffered: "cidade:offered",
  cidadeDeclined: "cidade:declined",
  cidadeTimedOut: "cidade:timed_out",
  cidadeWaitingForAvailable: "cidade:waiting_for_available",
  cidadeAccepted: "cidade:accepted",
  cidadeCancelled: "cidade:cancelled",
  cidadeQueueUpdated: "cidade:queue_updated",
  cidadeResponseUpdated: "cidade:response_updated",
  driverStatusChanged: "driver:status_changed",
  adminNotification: "admin:notification",
} as const;
