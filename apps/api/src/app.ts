import express from "express";
import cors from "cors";
import helmet from "helmet";
import morgan from "morgan";
import cookieParser from "cookie-parser";
import csrf from "csurf";
import { env } from "./config/env.js";
import { rateLimit } from "./middleware/rate-limit.js";
import { errorHandler } from "./middleware/error-handler.js";
import { authRouter } from "./modules/auth/auth.routes.js";
import { workspacesRouter } from "./modules/workspaces/workspaces.routes.js";
import { subscriptionsRouter } from "./modules/subscriptions/subscriptions.routes.js";
import { revenueRouter } from "./modules/revenue/revenue.routes.js";
import { staffRouter } from "./modules/staff/staff.routes.js";
import { playersRouter } from "./modules/players/players.routes.js";
import { adminRouter } from "./modules/admin/admin.routes.js";

export const app = express();

app.use(helmet());
app.use(cors({ origin: env.CORS_ORIGIN, credentials: true }));
app.use(morgan("dev"));
app.use(cookieParser());
app.use("/api/v1/subscriptions/webhook", express.raw({ type: "application/json" }));
app.use(express.json({ limit: "1mb" }));
app.use(rateLimit);

const csrfProtection = csrf({ cookie: true });
app.get("/api/v1/csrf-token", csrfProtection, (req, res) => {
  const token = (req as express.Request & { csrfToken: () => string }).csrfToken();
  return res.json({ csrfToken: token });
});

app.get("/api/v1/health", (_req, res) => {
  res.json({ status: "ok", service: "serverforge-api", timestamp: new Date().toISOString() });
});

app.use("/api/v1/auth", authRouter);
app.use("/api/v1/workspaces", workspacesRouter);
app.use("/api/v1/subscriptions", subscriptionsRouter);
app.use("/api/v1/revenue", revenueRouter);
app.use("/api/v1/staff", staffRouter);
app.use("/api/v1/players", playersRouter);
app.use("/api/v1/admin", adminRouter);

app.use(errorHandler);
