import type { NextFunction, Response } from "express";
import { prisma } from "../lib/prisma.js";
import type { AuthedRequest } from "../types.js";

export function enforcePlan(requiredPlan: "FREE" | "PRO" | "NETWORK") {
  const weight: Record<typeof requiredPlan, number> = {
    FREE: 1,
    PRO: 2,
    NETWORK: 3
  };

  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const workspaceId = req.workspace?.workspaceId;
    if (!workspaceId) {
      return res.status(400).json({ error: { message: "Workspace context missing" } });
    }

    const subscription = await prisma.subscription.findUnique({ where: { workspaceId } });
    if (!subscription || weight[subscription.plan] < weight[requiredPlan]) {
      return res.status(402).json({
        error: { message: `Feature requires ${requiredPlan} plan` }
      });
    }

    return next();
  };
}
