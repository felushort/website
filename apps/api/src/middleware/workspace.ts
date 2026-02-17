import type { NextFunction, Response } from "express";
import type { WorkspaceRole } from "@prisma/client";
import { prisma } from "../lib/prisma.js";
import type { AuthedRequest } from "../types.js";

export function requireWorkspaceAccess(minRole: WorkspaceRole = "STAFF") {
  const roleHierarchy: Record<WorkspaceRole, number> = {
    STAFF: 1,
    ADMIN: 2,
    OWNER: 3
  };

  return async (req: AuthedRequest, res: Response, next: NextFunction) => {
    const workspaceId = (req.headers["x-workspace-id"] as string) || (req.query.workspaceId as string);
    if (!workspaceId || !req.user) {
      return res.status(400).json({ error: { message: "Workspace context missing" } });
    }

    const membership = await prisma.workspaceMember.findUnique({
      where: {
        workspaceId_userId: {
          workspaceId,
          userId: req.user.id
        }
      }
    });

    if (!membership) {
      return res.status(403).json({ error: { message: "Workspace access denied" } });
    }

    if (roleHierarchy[membership.role] < roleHierarchy[minRole]) {
      return res.status(403).json({ error: { message: "Insufficient role permissions" } });
    }

    req.workspace = { workspaceId, role: membership.role };
    return next();
  };
}
