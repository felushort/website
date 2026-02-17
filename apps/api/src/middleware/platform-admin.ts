import type { NextFunction, Response } from "express";
import type { AuthedRequest } from "../types.js";

export function requirePlatformAdmin(req: AuthedRequest, res: Response, next: NextFunction) {
  if (!req.user?.isPlatformAdmin) {
    return res.status(403).json({ error: { message: "Platform admin access required" } });
  }
  return next();
}
