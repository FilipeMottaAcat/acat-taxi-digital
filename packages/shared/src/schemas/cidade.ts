import { z } from "zod";
import { CIDADE_CALL_TYPES } from "../constants.js";

export const createCidadeCallSchema = z.object({
  data: z.string().min(1, "Informe a data."),
  cidade: z.string().trim().min(1, "Informe a cidade."),
  horario: z.string().min(1, "Informe o horário."),
  type: z.enum(CIDADE_CALL_TYPES),
});
export type CreateCidadeCallInput = z.infer<typeof createCidadeCallSchema>;
