import type { NextFunction, Response } from "express";
import jwt from "jsonwebtoken";
import { env } from "../config/env.js";
import { prisma } from "../lib/prisma.js";
import type { AuthedRequest, JwtPayload } from "../types.js";

export async function requireAuth(req: AuthedRequest, res: Response, next: NextFunction) {
  const token = req.cookies?.accessToken || req.headers.authorization?.replace("Bearer ", "");
  if (!token) {
    return res.status(401).json({ error: { message: "Unauthorized" } });
  }

  try {
    const decoded = jwt.verify(token, env.JWT_ACCESS_SECRET) as JwtPayload;
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, email: true, isPlatformAdmin: true, isBanned: true }
    });

    if (!user || user.isBanned) {
      return res.status(403).json({ error: { message: "Access denied" } });
    }

    req.user = { id: user.id, email: user.email, isPlatformAdmin: user.isPlatformAdmin };
    return next();
  } catch {
    return res.status(401).json({ error: { message: "Invalid token" } });
  }
}
