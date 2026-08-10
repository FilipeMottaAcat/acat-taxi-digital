import { z } from "zod";
import { carNumberSchema, driverNameSchema, phoneSchema } from "./common.js";

export const addDriverManuallySchema = z.object({
  telefone: phoneSchema,
  carro: carNumberSchema,
  nome: driverNameSchema,
});
export type AddDriverManuallyInput = z.infer<typeof addDriverManuallySchema>;

export const rejectDriverSchema = z.object({
  motivo: z.string().trim().min(1, "Informe o motivo da recusa."),
});
export type RejectDriverInput = z.infer<typeof rejectDriverSchema>;

export const adjustTripCountSchema = z.object({
  tripCount: z.number().int().min(0, "A contagem de viagens não pode ser negativa."),
});
export type AdjustTripCountInput = z.infer<typeof adjustTripCountSchema>;

export const priorityOrderSchema = z.object({
  /** Ordered list of driver ids, highest priority (tiebreak winner) first. */
  driverIds: z.array(z.string()).min(1),
});
export type PriorityOrderInput = z.infer<typeof priorityOrderSchema>;

export const updateOwnStatusSchema = z.object({
  status: z.enum(["disponivel", "indisponivel"]),
});
export type UpdateOwnStatusInput = z.infer<typeof updateOwnStatusSchema>;
