import type { AdminRole, ApprovalStatus, OperationalStatus } from "@acat/shared";

export interface AdminUser {
  type: "admin";
  id: string;
  nome: string;
  usuario: string;
  role: AdminRole;
  active: boolean;
  createdAt: string;
}

export interface DriverUser {
  type: "driver";
  id: string;
  carNumber: string;
  name: string;
  phone: string;
  mustSetPassword: boolean;
  approvalStatus: ApprovalStatus;
  rejectionReason: string | null;
  blocked: boolean;
  operationalStatus: OperationalStatus;
  tripCount: number;
  priorityRank: number;
  createdAt: string;
}

export type CurrentUser = AdminUser | DriverUser;
