/**
 * Rate limiting middleware.
 *
 * Two flavours:
 *
 *   - translateLimiter: tight per-user budget on the OpenAI-burning routes
 *     (POST /api/translate, /api/batch, /api/batch/alternatives,
 *     /api/translate/quick, /api/compliance/check, /api/demo/check).
 *
 *   - mutationLimiter: looser per-user budget on the rest of the write
 *     surface (admin endpoints, glossary CRUD, memory create, reviews).
 *     The risk on these is brute-forcing the admin surface, not OpenAI
 *     spend.
 *
 * Keying: req.authUser.id when authenticated, falls back to the trusted
 * client IP (req.ip — honours `trust proxy` settings from Step 6.1).
 * Anonymous requests still get bucketed by IP. Each route is protected by
 * its own auth gate, so unauthenticated callers can't actually hit the
 * counters often, but the IP fallback gives a defence-in-depth answer if
 * something is misconfigured.
 *
 * The standard rate-limit headers are emitted so clients can back off.
 * On limit-hit: 429 with a brief JSON body. We surface the
 * retry-after-seconds value for UI use.
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { config } from "../config";

function keyFn(req: Request): string {
  const userId = req.authUser?.id;
  if (typeof userId === "number") return `u:${userId}`;
  // req.ip honours config.trustProxy (set on app.set("trust proxy", ...) in app.ts).
  // ipKeyGenerator normalises IPv6 to a /64 prefix so a single attacker can't
  // rotate the low 64 bits to dodge the limit — required by express-rate-limit
  // v8 when a custom keyGenerator touches req.ip.
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

/**
 * OpenAI-burning endpoints. 30 successful requests per minute per user.
 * The OpenAI-side rate limits are usually higher than this on a paid tier,
 * but the cap stops one runaway tab from emptying a free-tier quota in
 * seconds.
 */
export const translateLimiter = rateLimit({
  windowMs: 60_000,
  max: config.isDev ? 1000 : 30,    // dev: practically off; prod: 30/min
  keyGenerator: keyFn,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many translation requests. Slow down.", code: "rate_limited" },
});

/**
 * General-purpose mutation budget. 120/min per user.
 * Catches credential-stuffing-style abuse of admin endpoints (e.g. trying
 * many role-change requests in a loop) without affecting normal usage.
 */
export const mutationLimiter = rateLimit({
  windowMs: 60_000,
  max: config.isDev ? 2000 : 120,
  keyGenerator: keyFn,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many requests. Slow down.", code: "rate_limited" },
});
