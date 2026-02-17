import Stripe from "stripe";
import { env } from "../config/env.js";

export const stripe = new Stripe(env.STRIPE_SECRET_KEY || "sk_test_placeholder", {
  apiVersion: "2025-02-24.acacia"
});
