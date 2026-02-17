import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireWorkspaceAccess } from "../../middleware/workspace.js";
import { validateBody } from "../../middleware/validate.js";

const playerSchema = z.object({
  globalPlayerId: z.string().min(3),
  minecraftUuid: z.string().optional(),
  username: z.string().min(2)
});

const incidentSchema = z.object({
  playerProfileId: z.string(),
  type: z.string().min(2),
  severity: z.number().min(1).max(10),
  details: z.string().min(5)
});

export const playersRouter = Router();

playersRouter.use(requireAuth, requireWorkspaceAccess("STAFF"));

playersRouter.get("/profiles", async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const profiles = await prisma.playerProfile.findMany({
    where: { workspaceId },
    include: {
      playerIdentity: true,
      incidents: { orderBy: { createdAt: "desc" } }
    },
    orderBy: { updatedAt: "desc" }
  });

  return res.json({ profiles });
});

playersRouter.post("/profiles", requireWorkspaceAccess("ADMIN"), validateBody(playerSchema), async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const { globalPlayerId, minecraftUuid, username } = req.body;

  const identity = await prisma.playerIdentity.upsert({
    where: { globalPlayerId },
    update: {
      minecraftUuid,
      knownUsernames: { push: username }
    },
    create: {
      globalPlayerId,
      minecraftUuid,
      knownUsernames: [username]
    }
  });

  const profile = await prisma.playerProfile.upsert({
    where: {
      workspaceId_playerIdentityId: {
        workspaceId,
        playerIdentityId: identity.id
      }
    },
    update: {},
    create: {
      workspaceId,
      playerIdentityId: identity.id
    }
  });

  return res.status(201).json({ profile });
});

playersRouter.post("/incidents", requireWorkspaceAccess("ADMIN"), validateBody(incidentSchema), async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const { playerProfileId, type, severity, details } = req.body;

  const profile = await prisma.playerProfile.findFirst({ where: { id: playerProfileId, workspaceId } });
  if (!profile) {
    return res.status(404).json({ error: { message: "Player profile not found" } });
  }

  const incident = await prisma.playerIncident.create({
    data: {
      workspaceId,
      playerProfileId,
      type,
      severity,
      details,
      createdById: req.user!.id
    }
  });

  await prisma.playerProfile.update({
    where: { id: playerProfileId },
    data: {
      warningCount: { increment: 1 },
      reputationScore: { decrement: severity }
    }
  });

  return res.status(201).json({ incident });
});
