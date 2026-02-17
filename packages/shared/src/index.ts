import { z } from "zod";

export const workspaceRoleSchema = z.enum(["OWNER", "ADMIN", "STAFF"]);
export const subscriptionPlanSchema = z.enum(["FREE", "PRO", "NETWORK"]);

export const signupSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  displayName: z.string().min(2).max(60)
});

export const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8)
});

export const createWorkspaceSchema = z.object({
  name: z.string().min(3).max(80),
  slug: z.string().regex(/^[a-z0-9-]+$/).min(3).max(50)
});

export const revenueEntrySchema = z.object({
  date: z.string(),
  source: z.string().min(2),
  productName: z.string().min(2),
  amount: z.number().positive(),
  currency: z.string().default("USD")
});

export const staffApplicationStatusSchema = z.enum(["PENDING", "ACCEPTED", "REJECTED"]);

export type WorkspaceRole = z.infer<typeof workspaceRoleSchema>;
export type SubscriptionPlan = z.infer<typeof subscriptionPlanSchema>;
