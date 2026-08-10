import { z } from "zod";

export const createViagemRequestSchema = z.object({
  data: z.string().min(1, "Informe a data."), // ISO date string, validated against "now" server-side
  cidade: z.string().trim().min(1, "Informe a cidade."),
  horario: z.string().min(1, "Informe o horário."), // "HH:mm"
});
export type CreateViagemRequestInput = z.infer<typeof createViagemRequestSchema>;
