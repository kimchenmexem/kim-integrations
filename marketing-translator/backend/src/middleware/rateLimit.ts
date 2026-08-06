/**
 * Rate limiting middleware.
 *
 * Three flavours:
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
 *   - campaignCopyLimiter: service-to-service budget on /api/campaign-copy.
 *     Keyed by the calling service identity (the static CAMPAIGN_COPY_API_KEY
 *     the banner presents), not by IP — a single banner deployment behind one
 *     egress IP still gets its own bucket, and multiple banners sharing a NAT
 *     don't collide. Falls back to IP for callers that authenticate via Clerk
 *     or present no service key.
 *
 * KEYING (important — see Task 4 of the hardening review):
 *   These limiters are mounted at the app level, i.e. they run BEFORE each
 *   router's internal `requireAuth`, so `req.authUser` is NOT yet populated
 *   when the limiter computes its key. The previous implementation read
 *   `req.authUser?.id` and therefore always fell back to IP — meaning every
 *   authenticated user behind the same NAT shared one bucket.
 *
 *   The global `clerkMiddleware()` (mounted in app.ts) DOES run before these
 *   limiters, so `getAuth(req).userId` is already available. We key on that
 *   stable Clerk user id first, then the service key identity, then IP.
 *
 * The standard rate-limit headers are emitted so clients can back off.
 * On limit-hit: 429 with a brief JSON body. We surface the
 * retry-after-seconds value for UI use.
 */

import rateLimit, { ipKeyGenerator } from "express-rate-limit";
import type { Request } from "express";
import { getAuth } from "@clerk/express";
import { config } from "../config";

/**
 * Stable identity for a service-to-service caller.
 *
 * Currently only /api/campaign-copy authenticates with a static bearer key
 * (CAMPAIGN_COPY_API_KEY). When that key is presented and matches, every call
 * shares a single "campaign-copy" bucket regardless of source IP. Returns
 * null when no matching service key is present.
 */
function serviceKeyIdentity(req: Request): string | null {
  const expected = config.campaignCopyApiKey;
  if (!expected) return null;
  const header = req.header("authorization") ?? "";
  const match = /^Bearer\s+(.+)$/.exec(header);
  if (match && timingSafeEqual(match[1].trim(), expected)) {
    return "campaign-copy";
  }
  return null;
}

/**
 * Stable Clerk user id, if the request carries a valid Clerk session.
 * getAuth() only works after clerkMiddleware() has run (it has — it's mounted
 * globally before any router/limiter). Guarded so a disabled/misconfigured
 * Clerk never throws out of the key function.
 */
function clerkUserId(req: Request): string | null {
  if (!config.clerkEnabled) return null;
  try {
    const { userId } = getAuth(req);
    return userId ?? null;
  } catch {
    return null;
  }
}

/**
 * Key order (most-specific → least):
 *   1. svc:<service>  — service-to-service key identity (campaign-copy)
 *   2. u:<clerkId>    — authenticated Clerk user (stable across NAT)
 *   3. lu:<localId>   — local authUser id, if a preceding middleware set it
 *   4. ip:<prefix>    — anonymous / unauthenticated fallback
 */
function keyFn(req: Request): string {
  const svc = serviceKeyIdentity(req);
  if (svc) return `svc:${svc}`;

  const clerkId = clerkUserId(req);
  if (clerkId) return `u:${clerkId}`;

  const localId = req.authUser?.id;
  if (typeof localId === "number") return `lu:${localId}`;

  // req.ip honours config.trustProxy (set on app.set("trust proxy", ...) in app.ts).
  // ipKeyGenerator normalises IPv6 to a /64 prefix so a single attacker can't
  // rotate the low 64 bits to dodge the limit — required by express-rate-limit
  // v8 when a custom keyGenerator touches req.ip.
  return `ip:${ipKeyGenerator(req.ip ?? "unknown")}`;
}

function timingSafeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) {
    mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return mismatch === 0;
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

/**
 * Service-to-service budget for /api/campaign-copy.
 *
 * One banner "generate campaign" click fans out to several campaign-copy
 * calls (one per locale / endpoint), and each of those triggers multiple
 * OpenAI calls server-side (copy + per-field compliance validators). 60/min
 * gives comfortable headroom for a few concurrent generations while still
 * capping a runaway loop. Keyed by service identity (see keyFn), so it is
 * NOT shared with unrelated IP traffic.
 */
export const campaignCopyLimiter = rateLimit({
  windowMs: 60_000,
  max: config.isDev ? 2000 : 60,
  keyGenerator: keyFn,
  standardHeaders: "draft-8",
  legacyHeaders: false,
  message: { error: "Too many campaign-copy requests. Slow down.", code: "rate_limited" },
});
