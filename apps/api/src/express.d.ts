import type { WorkspaceRole } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      user?: {
        id: string;
        email: string;
        isPlatformAdmin: boolean;
      };
      workspace?: {
        workspaceId: string;
        role: WorkspaceRole;
      };
    }
  }
}

export {};
