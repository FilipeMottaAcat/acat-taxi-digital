import { z } from "zod";
import { passwordSchema, usernameSchema } from "./common.js";

export const createAdminSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome."),
  usuario: usernameSchema,
  senha: passwordSchema,
  isMaster: z.boolean().default(false),
});
export type CreateAdminInput = z.infer<typeof createAdminSchema>;
