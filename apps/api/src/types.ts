import type { WorkspaceRole } from "@prisma/client";
import type { Request } from "express";

export type JwtPayload = {
  sub: string;
  email: string;
};

export type AuthUser = {
  id: string;
  email: string;
  isPlatformAdmin: boolean;
};

export type WorkspaceContext = {
  workspaceId: string;
  role: WorkspaceRole;
};

export type AuthedRequest = Request & {
  user?: AuthUser;
  workspace?: WorkspaceContext;
};
