/**
 * Admin token guard for /api/compliance/admin/*.
 *
 * Requires the ADMIN_TOKEN env var at server start. Every admin request must
 * send that token in the X-Admin-Token header. Comparison is constant-time.
 *
 * Failure modes:
 *   - ADMIN_TOKEN unset on server         -> 500 (fail closed, no silent bypass)
 *   - Header missing on request           -> 401
 *   - Header present but mismatched token -> 403
 */

import type { Request, Response, NextFunction } from "express";
import crypto from "crypto";

export function requireAdminToken(req: Request, res: Response, next: NextFunction): void {
  const expected = process.env.ADMIN_TOKEN;
  if (!expected || expected.length === 0) {
    console.error("[admin-auth] ADMIN_TOKEN is not set; refusing admin request.");
    res.status(500).json({ error: "Server misconfigured: ADMIN_TOKEN not set." });
    return;
  }

  const provided = (req.header("X-Admin-Token") ?? "").trim();
  if (provided.length === 0) {
    res.status(401).json({ error: "Missing X-Admin-Token header." });
    return;
  }

  if (!constantTimeEqual(provided, expected)) {
    res.status(403).json({ error: "Invalid admin token." });
    return;
  }

  next();
}

/**
 * Constant-time string comparison. Always runs a timingSafeEqual against a
 * same-length buffer so mismatched lengths don't short-circuit visibly.
 */
export function constantTimeEqual(a: string, b: string): boolean {
  const ab = Buffer.from(a, "utf8");
  const bb = Buffer.from(b, "utf8");
  if (ab.length !== bb.length) {
    const dummy = Buffer.alloc(bb.length);
    crypto.timingSafeEqual(dummy, bb);
    return false;
  }
  return crypto.timingSafeEqual(ab, bb);
}
