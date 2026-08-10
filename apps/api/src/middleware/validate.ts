import type { NextFunction, Request, Response } from "express";
import type { ZodSchema } from "zod";

/** Validates req.body against a zod schema, replacing it with the parsed (typed, coerced) value. */
export function validateBody(schema: ZodSchema) {
  return (req: Request, res: Response, next: NextFunction) => {
    const result = schema.safeParse(req.body);
    if (!result.success) {
      const first = result.error.issues[0];
      res.status(400).json({ error: first?.message ?? "Dados inválidos.", issues: result.error.issues });
      return;
    }
    req.body = result.data;
    next();
  };
}
