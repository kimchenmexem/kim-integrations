/**
 * Clerk-backed request authentication + local role-based authorization.
 *
 * The global clerkMiddleware() (mounted in app.ts) populates `req.auth()`.
 * These wrappers translate that into a local `req.authUser` and enforce
 * role checks using Prisma-backed data — never Clerk org roles.
 */

import type { Request, Response, NextFunction, RequestHandler } from "express";
import { Role } from "@prisma/client";
import { getAuth } from "@clerk/express";
import { config } from "../config";
import {
  findUserByExternalIdentity,
  getOrBootstrapUserFromClerk,
} from "../services/users";

function clerkNotConfigured(res: Response) {
  res
    .status(503)
    .json({ error: "Authentication is not configured on this server." });
}

/**
 * Populate req.authUser if (and only if) the request is Clerk-authenticated
 * AND a local UserIdentity mapping exists. Never bootstraps. Never 401s.
 * Use this for routes that behave differently but still work for anon users.
 */
export const optionalAuth: RequestHandler = async (req, _res, next) => {
  if (!config.clerkEnabled) return next();
  try {
    const auth = getAuth(req);
    if (!auth.userId) return next();
    const user = await findUserByExternalIdentity("clerk", auth.userId);
    if (user) {
      req.authUser = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      };
    }
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Require a Clerk-authenticated request AND a matching active local user.
 * Bootstraps the local user on first sight (see getOrBootstrapUserFromClerk).
 *   - no Clerk session       → 401
 *   - Clerk disabled         → 503
 *   - local user inactive    → 403
 */
export const requireAuth: RequestHandler = async (req, res, next) => {
  if (!config.clerkEnabled) return clerkNotConfigured(res);
  try {
    const auth = getAuth(req);
    if (!auth.userId) {
      res.status(401).json({ error: "Authentication required." });
      return;
    }
    const user = await getOrBootstrapUserFromClerk(auth.userId);
    if (!user.isActive) {
      res.status(403).json({ error: "Account is inactive." });
      return;
    }
    req.authUser = {
      id: user.id,
      email: user.email,
      fullName: user.fullName,
      role: user.role,
      isActive: user.isActive,
    };
    next();
  } catch (err) {
    next(err);
  }
};

/**
 * Require requireAuth() to pass AND the local user's role to be one of the
 * provided roles. Roles are strings from the Prisma Role enum (USER |
 * REVIEWER | MANAGER | ADMIN); pass the narrow set that should have access.
 *
 * ADMIN is NEVER auto-included — if a route should also allow ADMIN, include
 * it explicitly. This keeps the policy readable at the call site.
 *
 * Failure modes:
 *   - not authenticated  → 401
 *   - inactive user      → 403
 *   - wrong role         → 403
 */
export function requireRole(...roles: Role[]): RequestHandler {
  if (roles.length === 0) {
    throw new Error("requireRole() called with no roles — misuse");
  }
  const allowed = new Set<Role>(roles);
  return async (req, res, next) => {
    // Delegate to requireAuth for session + local user resolution. We can't
    // just call the handler directly because it calls next() on success; we
    // instead inline the same steps so we can gate on role before next().
    if (!config.clerkEnabled) return clerkNotConfigured(res);
    try {
      const auth = getAuth(req);
      if (!auth.userId) {
        res.status(401).json({ error: "Authentication required." });
        return;
      }
      const user = await getOrBootstrapUserFromClerk(auth.userId, req);
      if (!user.isActive) {
        res.status(403).json({ error: "Account is inactive." });
        return;
      }
      if (!allowed.has(user.role)) {
        res.status(403).json({
          error: "Insufficient role.",
          required: [...allowed],
          actual: user.role,
        });
        return;
      }
      req.authUser = {
        id: user.id,
        email: user.email,
        fullName: user.fullName,
        role: user.role,
        isActive: user.isActive,
      };
      next();
    } catch (err) {
      next(err);
    }
  };
}

// Convenience alias — semantically identical to requireRole(...roles) but
// more readable at call sites that want to emphasise disjunction.
export const requireAnyRole = requireRole;

// Re-exports so route modules can write a single `from "../middleware/auth"`.
export { getAuth, Role };
export type { Request, Response, NextFunction };
