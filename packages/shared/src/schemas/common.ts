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
