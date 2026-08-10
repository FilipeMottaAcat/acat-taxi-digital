import { z } from "zod";

/** Matches the output of the Brazilian phone mask, e.g. "(13) 90000-0000" or "(13) 9000-0000". */
export const phoneSchema = z
  .string()
  .regex(/^\(\d{2}\) \d{4,5}-\d{4}$/, "Informe um telefone válido, com DDD.");

export const carNumberSchema = z
  .string()
  .regex(/^\d{3}$/, "O número do carro deve ter exatamente 3 dígitos.");

export const driverNameSchema = z
  .string()
  .trim()
  .min(1, "Informe o nome do motorista (somente letras).")
  .regex(/^[A-Za-zÀ-ÿ\s]+$/, "O nome deve conter somente letras.");

export const passwordSchema = z
  .string()
  .min(6, "A senha precisa ter pelo menos 6 caracteres.");

/** Login username for admins — no spaces, so it can never silently absorb a full name by mistake. */
export const usernameSchema = z
  .string()
  .trim()
  .toLowerCase()
  .min(3, "Usuário deve ter pelo menos 3 caracteres.")
  .regex(/^[a-z0-9._-]+$/, "Usuário deve conter só letras minúsculas, números, ponto, hífen ou underscore — sem espaços.");
