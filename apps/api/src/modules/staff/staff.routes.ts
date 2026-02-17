import { Router } from "express";
import { z } from "zod";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireWorkspaceAccess } from "../../middleware/workspace.js";
import { validateBody } from "../../middleware/validate.js";

const jobPostSchema = z.object({
  title: z.string().min(3),
  description: z.string().min(10),
  formSchema: z.any()
});

const applicationUpdateSchema = z.object({
  status: z.enum(["PENDING", "ACCEPTED", "REJECTED"]),
  internalNotes: z.string().optional(),
  applicantTag: z.string().optional()
});

export const staffRouter = Router();

staffRouter.use(requireAuth, requireWorkspaceAccess("STAFF"));

staffRouter.post("/jobs", requireWorkspaceAccess("ADMIN"), validateBody(jobPostSchema), async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const { title, description, formSchema } = req.body;

  const job = await prisma.jobPost.create({
    data: {
      workspaceId,
      title,
      description,
      formSchema,
      createdById: req.user!.id
    }
  });

  return res.status(201).json({ job });
});

staffRouter.get("/jobs", async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const jobs = await prisma.jobPost.findMany({
    where: { workspaceId },
    orderBy: { createdAt: "desc" }
  });
  return res.json({ jobs });
});

staffRouter.get("/applications", async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const applications = await prisma.application.findMany({
    where: { workspaceId },
    include: { jobPost: true },
    orderBy: { createdAt: "desc" }
  });

  return res.json({ applications });
});

staffRouter.patch("/applications/:applicationId", requireWorkspaceAccess("ADMIN"), validateBody(applicationUpdateSchema), async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const applicationId = String(req.params.applicationId);
  const { status, internalNotes, applicantTag } = req.body;

  const existing = await prisma.application.findFirst({
    where: { id: applicationId, workspaceId }
  });

  if (!existing) {
    return res.status(404).json({ error: { message: "Application not found" } });
  }

  const updated = await prisma.application.update({
    where: { id: applicationId },
    data: { status, internalNotes, applicantTag }
  });

  await prisma.auditLog.create({
    data: {
      workspaceId,
      userId: req.user!.id,
      action: "APPLICATION_STATUS_UPDATED",
      entityType: "Application",
      entityId: applicationId,
      metadata: { status }
    }
  });

  return res.json({ application: updated });
});
