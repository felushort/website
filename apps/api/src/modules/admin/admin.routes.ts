import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requirePlatformAdmin } from "../../middleware/platform-admin.js";

export const adminRouter = Router();

adminRouter.use(requireAuth, requirePlatformAdmin);

adminRouter.get("/workspaces", async (_req, res) => {
  const workspaces = await prisma.workspace.findMany({
    include: { subscriptions: true, members: true }
  });
  return res.json({ workspaces });
});

adminRouter.get("/health", async (_req, res) => {
  const workspaceCount = await prisma.workspace.count();
  const userCount = await prisma.user.count();

  return res.json({
    health: {
      status: "ok",
      workspaceCount,
      userCount,
      timestamp: new Date().toISOString()
    }
  });
});

adminRouter.patch("/users/:userId/ban", async (req, res) => {
  const userId = req.params.userId;
  const { banned } = req.body as { banned: boolean };

  const user = await prisma.user.update({
    where: { id: userId },
    data: { isBanned: banned }
  });

  return res.json({ user });
});

adminRouter.patch("/workspaces/:workspaceId/flags", async (req, res) => {
  const workspaceId = req.params.workspaceId;
  const featureFlags = req.body;

  const workspace = await prisma.workspace.update({
    where: { id: workspaceId },
    data: { featureFlags }
  });

  return res.json({ workspace });
});
