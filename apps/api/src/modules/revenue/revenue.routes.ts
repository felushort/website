import { Router } from "express";
import { revenueEntrySchema } from "@serverforge/shared";
import { prisma } from "../../lib/prisma.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireWorkspaceAccess } from "../../middleware/workspace.js";
import { enforcePlan } from "../../middleware/subscription.js";
import { validateBody } from "../../middleware/validate.js";

export const revenueRouter = Router();

revenueRouter.use(requireAuth);

revenueRouter.get("/overview", requireWorkspaceAccess("STAFF"), async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;

  const entries = await prisma.revenueEntry.findMany({
    where: { workspaceId },
    orderBy: { date: "asc" }
  });

  const total = entries.reduce((acc, item) => acc + Number(item.amount), 0);

  const byProduct = entries.reduce<Record<string, number>>((acc, item) => {
    const key = item.productName;
    acc[key] = (acc[key] || 0) + Number(item.amount);
    return acc;
  }, {});

  return res.json({
    kpis: {
      revenueTotal: total,
      conversionRate: 0.0,
      customerLtv: 0.0
    },
    byProduct,
    entries
  });
});

revenueRouter.post("/entries", requireWorkspaceAccess("ADMIN"), validateBody(revenueEntrySchema), async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const { date, source, productName, amount, currency } = req.body;

  const created = await prisma.revenueEntry.create({
    data: {
      workspaceId,
      date: new Date(date),
      source,
      productName,
      amount,
      currency,
      createdById: req.user!.id
    }
  });

  return res.status(201).json({ entry: created });
});

revenueRouter.get("/export.csv", requireWorkspaceAccess("STAFF"), enforcePlan("PRO"), async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const entries = await prisma.revenueEntry.findMany({
    where: { workspaceId },
    orderBy: { date: "desc" }
  });

  const header = "date,source,productName,amount,currency";
  const rows = entries.map((entry) =>
    [entry.date.toISOString().split("T")[0], entry.source, entry.productName, entry.amount.toString(), entry.currency].join(",")
  );

  const csv = [header, ...rows].join("\n");
  res.setHeader("Content-Type", "text/csv");
  res.setHeader("Content-Disposition", "attachment; filename=revenue.csv");
  return res.send(csv);
});

revenueRouter.post("/tebex/webhook", requireWorkspaceAccess("ADMIN"), async (_req, res) => {
  return res.status(202).json({ message: "Tebex webhook endpoint ready for integration" });
});
