import { Router } from "express";
import { prisma } from "../../lib/prisma.js";
import { stripe } from "../../lib/stripe.js";
import { requireAuth } from "../../middleware/auth.js";
import { requireWorkspaceAccess } from "../../middleware/workspace.js";
import { env } from "../../config/env.js";

export const subscriptionsRouter = Router();

subscriptionsRouter.use(requireAuth);

subscriptionsRouter.get("/current", requireWorkspaceAccess("STAFF"), async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const subscription = await prisma.subscription.findUnique({ where: { workspaceId } });
  return res.json({ subscription });
});

subscriptionsRouter.post("/checkout", requireWorkspaceAccess("OWNER"), async (req, res) => {
  const workspaceId = req.workspace!.workspaceId;
  const { plan } = req.body as { plan: "PRO" | "NETWORK" };

  const subscription = await prisma.subscription.findUnique({ where: { workspaceId } });
  if (!subscription) {
    return res.status(404).json({ error: { message: "Subscription not found" } });
  }

  let customerId = subscription.stripeCustomerId;
  if (!customerId) {
    const customer = await stripe.customers.create({
      metadata: { workspaceId },
      email: req.user!.email
    });
    customerId = customer.id;
  }

  const priceId = plan === "PRO" ? env.STRIPE_PRICE_PRO : env.STRIPE_PRICE_NETWORK;
  const checkoutSession = await stripe.checkout.sessions.create({
    mode: "subscription",
    customer: customerId,
    success_url: `${env.CORS_ORIGIN}/billing?success=1`,
    cancel_url: `${env.CORS_ORIGIN}/billing?canceled=1`,
    line_items: [{ price: priceId, quantity: 1 }],
    metadata: { workspaceId, plan }
  });

  await prisma.subscription.update({
    where: { workspaceId },
    data: { stripeCustomerId: customerId }
  });

  return res.json({ url: checkoutSession.url });
});

subscriptionsRouter.post("/webhook", async (req, res) => {
  const signature = req.headers["stripe-signature"] as string;
  if (!signature) {
    return res.status(400).json({ error: { message: "Missing stripe signature" } });
  }

  let event;
  try {
    event = stripe.webhooks.constructEvent(req.body, signature, env.STRIPE_WEBHOOK_SECRET);
  } catch {
    return res.status(400).json({ error: { message: "Invalid webhook signature" } });
  }

  if (event.type === "checkout.session.completed") {
    const session = event.data.object as { metadata?: { workspaceId?: string; plan?: "PRO" | "NETWORK" } };
    const workspaceId = session.metadata?.workspaceId;
    const plan = session.metadata?.plan;

    if (workspaceId && plan) {
      await prisma.subscription.update({
        where: { workspaceId },
        data: {
          plan,
          status: "ACTIVE"
        }
      });
    }
  }

  return res.status(200).json({ received: true });
});
