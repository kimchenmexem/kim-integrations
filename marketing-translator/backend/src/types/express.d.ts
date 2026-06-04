import type { Role } from "@prisma/client";

declare global {
  namespace Express {
    interface Request {
      /**
       * The local app user for the current request.
       * Populated by optionalAuth / requireAuth after successful Clerk verification
       * AND a successful UserIdentity lookup. Never populated otherwise.
       */
      authUser?: {
        id: number;
        email: string;
        fullName: string | null;
        role: Role;
        isActive: boolean;
      };
    }
  }
}

export {};
