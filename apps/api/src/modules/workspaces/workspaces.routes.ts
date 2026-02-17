import { Router } from "express";
import { createWorkspaceSchema } from "@serverforge/shared";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { validateBody } from "../../middleware/validate.js";
import { requireWorkspaceAccess } from "../../middleware/workspace.js";

export const workspacesRouter = Router();

workspacesRouter.use(requireAuth);

workspacesRouter.get("/", async (req, res) => {
  const userId = req.user!.id;
  const memberships = await prisma.workspaceMember.findMany({
    where: { userId },
    include: {
      workspace: {
        include: {
          subscriptions: true
        }
      }
    }
  });

  return res.json({
    workspaces: memberships.map((membership) => ({
      id: membership.workspace.id,
      slug: membership.workspace.slug,
      name: membership.workspace.name,
      role: membership.role,
      subscription: membership.workspace.subscriptions[0] || null
    }))
  });
});

workspacesRouter.post("/", validateBody(createWorkspaceSchema), async (req, res) => {
  const { name, slug } = req.body;
  const ownerId = req.user!.id;

  const workspace = await prisma.workspace.create({
    data: {
      name,
      slug,
      ownerId,
      members: {
        create: {
          userId: ownerId,
          role: "OWNER"
        }
      },
      subscriptions: {
        create: {
          ownerId,
          plan: "FREE",
          status: "ACTIVE"
        }
      }
    }
  });

  return res.status(201).json({ workspace });
});

workspacesRouter.post("/:workspaceId/invite", requireWorkspaceAccess("ADMIN"), async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const { email, role } = req.body as { email: string; role: "ADMIN" | "STAFF" };

  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(404).json({ error: { message: "User not found" } });
  }

  await prisma.workspaceMember.upsert({
    where: {
      workspaceId_userId: {
        workspaceId,
        userId: user.id
      }
    },
    update: { role },
    create: { workspaceId, userId: user.id, role }
  });

  return res.status(201).json({ success: true });
});

workspacesRouter.get("/:workspaceId/members", requireWorkspaceAccess("STAFF"), async (req, res) => {
  const workspaceId = String(req.params.workspaceId);
  const members = await prisma.workspaceMember.findMany({
    where: { workspaceId },
    include: {
      user: {
        select: { id: true, email: true, displayName: true }
      }
    }
  });

  return res.json({ members });
});
