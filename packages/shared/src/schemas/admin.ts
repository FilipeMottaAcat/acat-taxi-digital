import { z } from "zod";
import { passwordSchema } from "./common.js";

export const createAdminSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome."),
  usuario: z.string().trim().min(3, "Usuário deve ter pelo menos 3 caracteres.").toLowerCase(),
  senha: passwordSchema,
  isMaster: z.boolean().default(false),
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
