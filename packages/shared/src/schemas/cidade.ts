import { z } from "zod";
import { CIDADE_CALL_TYPES, CIDADE_RESPONSE_TYPES } from "../constants.js";

export const createCidadeCallSchema = z.object({
  data: z.string().min(1, "Informe a data."),
  cidade: z.string().trim().min(1, "Informe a cidade."),
  horario: z.string().min(1, "Informe o horário."),
  type: z.enum(CIDADE_CALL_TYPES),
});
export type CreateCidadeCallInput = z.infer<typeof createCidadeCallSchema>;

export const respondCidadeCallSchema = z.object({
  resposta: z.enum(CIDADE_RESPONSE_TYPES),
});
export type RespondCidadeCallInput = z.infer<typeof respondCidadeCallSchema>;
