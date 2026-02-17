import type { NextFunction, Request, Response } from "express";

export function errorHandler(error: unknown, _req: Request, res: Response, _next: NextFunction) {
  const err = error as Error & { status?: number };
  const status = err.status ?? 500;

  res.status(status).json({
    error: {
      message: err.message || "Internal server error",
      status
    }
  });
}
