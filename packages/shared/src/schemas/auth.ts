import { z } from "zod";
import { carNumberSchema, driverNameSchema, passwordSchema, phoneSchema, usernameSchema } from "./common.js";

export const bootstrapMasterSchema = z.object({
  nome: z.string().trim().min(1, "Informe o nome."),
  usuario: usernameSchema,
  senha: passwordSchema,
});
export type BootstrapMasterInput = z.infer<typeof bootstrapMasterSchema>;

export const adminLoginSchema = z.object({
  usuario: z.string().trim().min(1, "Informe o usuário.").toLowerCase(),
  senha: z.string().min(1, "Informe a senha."),
});
export type AdminLoginInput = z.infer<typeof adminLoginSchema>;

export const driverSignupSchema = z
  .object({
    telefone: phoneSchema,
    carro: carNumberSchema,
    nome: driverNameSchema,
    senha: passwordSchema,
    confirmarSenha: z.string(),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: "As senhas não coincidem.",
    path: ["confirmarSenha"],
  });
export type DriverSignupInput = z.infer<typeof driverSignupSchema>;

export const driverLoginSchema = z.object({
  telefone: phoneSchema,
  senha: z.string().min(1, "Informe a senha."),
});
export type DriverLoginInput = z.infer<typeof driverLoginSchema>;

export const setPasswordSchema = z
  .object({
    senha: passwordSchema,
    confirmarSenha: z.string(),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: "As senhas não coincidem.",
    path: ["confirmarSenha"],
  });
export type SetPasswordInput = z.infer<typeof setPasswordSchema>;

export const setDriverPasswordSchema = z
  .object({
    telefone: phoneSchema,
    senha: passwordSchema,
    confirmarSenha: z.string(),
  })
  .refine((data) => data.senha === data.confirmarSenha, {
    message: "As senhas não coincidem.",
    path: ["confirmarSenha"],
  });
export type SetDriverPasswordInput = z.infer<typeof setDriverPasswordSchema>;
