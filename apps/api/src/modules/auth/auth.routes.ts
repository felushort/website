import { Router } from "express";
import axios from "axios";
import { loginSchema, signupSchema } from "@serverforge/shared";
import { validateBody } from "../../middleware/validate.js";
import { createUser, signAccessToken, signRefreshToken, verifyCredentials } from "./auth.service.js";
import { env } from "../../config/env.js";
import { prisma } from "../../lib/prisma.js";

export const authRouter = Router();

authRouter.post("/signup", validateBody(signupSchema), async (req, res, next) => {
  try {
    const { email, password, displayName } = req.body;
    const user = await createUser(email, password, displayName);

    const accessToken = signAccessToken(user.id, user.email);
    const refreshToken = signRefreshToken(user.id, user.email);

    res.cookie("accessToken", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production" });
    res.cookie("refreshToken", refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production" });

    return res.status(201).json({ user: { id: user.id, email: user.email, displayName: user.displayName } });
  } catch (error) {
    return next(error);
  }
});

authRouter.post("/login", validateBody(loginSchema), async (req, res) => {
  const { email, password } = req.body;
  const user = await verifyCredentials(email, password);

  if (!user) {
    return res.status(401).json({ error: { message: "Invalid credentials" } });
  }

  const accessToken = signAccessToken(user.id, user.email);
  const refreshToken = signRefreshToken(user.id, user.email);

  res.cookie("accessToken", accessToken, { httpOnly: true, secure: process.env.NODE_ENV === "production" });
  res.cookie("refreshToken", refreshToken, { httpOnly: true, secure: process.env.NODE_ENV === "production" });

  return res.json({ user: { id: user.id, email: user.email, displayName: user.displayName } });
});

authRouter.post("/logout", (_req, res) => {
  res.clearCookie("accessToken");
  res.clearCookie("refreshToken");
  return res.status(204).send();
});

authRouter.get("/microsoft/start", (req, res) => {
  const state = req.query.state || "serverforge";
  const authUrl = new URL(`https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/authorize`);
  authUrl.searchParams.set("client_id", env.MICROSOFT_CLIENT_ID);
  authUrl.searchParams.set("response_type", "code");
  authUrl.searchParams.set("redirect_uri", env.MICROSOFT_REDIRECT_URI);
  authUrl.searchParams.set("response_mode", "query");
  authUrl.searchParams.set("scope", "openid email profile");
  authUrl.searchParams.set("state", String(state));
  return res.json({ url: authUrl.toString() });
});

authRouter.get("/microsoft/callback", async (req, res) => {
  const code = String(req.query.code || "");
  if (!code) {
    return res.status(400).json({ error: { message: "Missing Microsoft auth code" } });
  }

  const tokenResponse = await axios.post(
    `https://login.microsoftonline.com/${env.MICROSOFT_TENANT_ID}/oauth2/v2.0/token`,
    new URLSearchParams({
      client_id: env.MICROSOFT_CLIENT_ID,
      client_secret: env.MICROSOFT_CLIENT_SECRET,
      code,
      redirect_uri: env.MICROSOFT_REDIRECT_URI,
      grant_type: "authorization_code"
    }).toString(),
    { headers: { "Content-Type": "application/x-www-form-urlencoded" } }
  );

  const accessToken = tokenResponse.data.access_token as string;
  const profileResponse = await axios.get("https://graph.microsoft.com/v1.0/me", {
    headers: { Authorization: `Bearer ${accessToken}` }
  });

  const microsoftId = String(profileResponse.data.id);
  const email = String(profileResponse.data.mail || profileResponse.data.userPrincipalName);
  const displayName = String(profileResponse.data.displayName || "Minecraft User");

  const user = await prisma.user.upsert({
    where: { email },
    update: { microsoftId, displayName },
    create: { email, displayName, microsoftId }
  });

  const localAccess = signAccessToken(user.id, user.email);
  const localRefresh = signRefreshToken(user.id, user.email);

  res.cookie("accessToken", localAccess, { httpOnly: true, secure: process.env.NODE_ENV === "production" });
  res.cookie("refreshToken", localRefresh, { httpOnly: true, secure: process.env.NODE_ENV === "production" });

  return res.redirect(`${env.CORS_ORIGIN}/dashboard`);
});
