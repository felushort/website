import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import type { SignOptions } from "jsonwebtoken";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

export async function createUser(email: string, password: string, displayName: string) {
  const existing = await prisma.user.findUnique({ where: { email } });
  if (existing) {
    const error = new Error("Email already in use");
    (error as Error & { status?: number }).status = 409;
    throw error;
  }

  const passwordHash = await bcrypt.hash(password, env.BCRYPT_ROUNDS);
  return prisma.user.create({
    data: {
      email,
      passwordHash,
      displayName
    }
  });
}

export async function verifyCredentials(email: string, password: string) {
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user || !user.passwordHash) {
    return null;
  }

  const valid = await bcrypt.compare(password, user.passwordHash);
  if (!valid) {
    return null;
  }

  return user;
}

export function signAccessToken(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, env.JWT_ACCESS_SECRET, {
    expiresIn: env.JWT_ACCESS_TTL as SignOptions["expiresIn"]
  });
}

export function signRefreshToken(userId: string, email: string) {
  return jwt.sign({ sub: userId, email }, env.JWT_REFRESH_SECRET, {
    expiresIn: env.JWT_REFRESH_TTL as SignOptions["expiresIn"]
  });
}
