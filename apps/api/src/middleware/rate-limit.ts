import type { NextFunction, Request, Response } from "express";
import { RateLimiterRedis } from "rate-limiter-flexible";
import { redis } from "../lib/redis.js";

const limiter = new RateLimiterRedis({
  storeClient: redis,
  keyPrefix: "rate_limit",
  points: 120,
  duration: 60
});

export async function rateLimit(req: Request, res: Response, next: NextFunction) {
  try {
    const key = req.ip || "unknown";
    await limiter.consume(key);
    return next();
  } catch {
    return res.status(429).json({ error: { message: "Too many requests" } });
  }
}
