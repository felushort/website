import type { NextFunction, Response } from "express";
import type { ZodSchema } from "zod";
import type { AuthedRequest } from "../types.js";

export function validateBody<T>(schema: ZodSchema<T>) {
  return (req: AuthedRequest, res: Response, next: NextFunction) => {
    const parsed = schema.safeParse(req.body);
    if (!parsed.success) {
      return res.status(400).json({
        error: { message: "Validation failed", details: parsed.error.flatten() }
      });
    }
    req.body = parsed.data;
    return next();
  };
}
