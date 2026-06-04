/**
 * /api/auth/* — minimal auth surface.
 *
 *   GET /me   Returns the authenticated Clerk identity + the local User.
 *             Bootstraps the local User on first sight.
 *
 * Authorization (role gates, admin-token migration, etc.) is intentionally
 * out of scope here; this route is the foundation the next step builds on.
 */

import { Router, type Request, type Response } from "express";
import { getAuth } from "@clerk/express";
import { config } from "../config";
import { asyncHandler } from "../middleware/asyncHandler";
import { BootstrapRefusedError, getOrBootstrapUserFromClerk } from "../services/users";
import { clerkClient } from "../auth/clerk";

const router = Router();

router.get(
  "/me",
  asyncHandler(async (req: Request, res: Response) => {
    if (!config.clerkEnabled) {
      res.status(503).json({ error: "Authentication is not configured on this server." });
      return;
    }

    const auth = getAuth(req);
    if (!auth.userId) {
      res.status(401).json({ error: "Not signed in." });
      return;
    }

    let user;
    try {
      user = await getOrBootstrapUserFromClerk(auth.userId, req);
    } catch (err) {
      if (err instanceof BootstrapRefusedError) {
        res.status(err.status).json({ error: err.message });
        return;
      }
      throw err;
    }

    // Fetch minimal Clerk summary for the response. Cheap + cached by Clerk SDK.
    const clerkUser = await clerkClient!.users.getUser(auth.userId);
    const primary = clerkUser.emailAddresses.find(
      (e) => e.id === clerkUser.primaryEmailAddressId
    );

    res.json({
      clerk: {
        userId: clerkUser.id,
        email: primary?.emailAddress ?? null,
        emailVerified: primary?.verification?.status === "verified",
        firstName: clerkUser.firstName,
        lastName: clerkUser.lastName,
      },
      user: {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
        createdAt: user.createdAt,
      },
    });
  })
);

export default router;
