import { NextRequest, NextResponse } from "next/server";

// ─────────────────────────────────────────────────────────────────────────────
// Edge middleware — two layers of protection, both server-only (this file
// never ships to the browser bundle, so no secret is ever exposed to clients):
//
//   1. HTTP Basic Auth gate (BASIC_AUTH_USER / BASIC_AUTH_PASSWORD)
//      Fronts the whole deployed app. The browser prompts once and caches the
//      credentials per host, resending them on same-origin fetch/XHR — so the
//      UI keeps working after the first prompt. No-op when unset (local dev).
//
//   2. Internal API guard (BANNER_INTERNAL_API_KEY) for MUTATION / COST routes
//      Every non-GET /api/* request (campaign generation, rendering, exports,
//      uploads, generators, QA, state mutation — anything that spends money,
//      calls a paid LLM/image API, or writes to storage) must present EITHER:
//        - Authorization: Bearer <BANNER_INTERNAL_API_KEY>, or
//        - x-internal-api-key: <BANNER_INTERNAL_API_KEY>, or
//        - valid Basic Auth (so the authenticated browser UI still works
//          without ever embedding the internal key in client code).
//
// FAIL-CLOSED: in production, if NEITHER the internal key NOR Basic Auth is
// configured, mutation routes are rejected outright (503) rather than left
// open. In development/test, an explicit ALLOW_UNAUTHENTICATED_DEV_API=true
// bypass lets the local UI hit these routes without any credentials.
//
// GET /api/* reads (brand-kit, generators/registry, generators/asset/[id],
// and the GET half of dual routes) stay public behind Basic Auth only — they
// don't mutate state or spend money.
//
// Rate limiting: a simple in-memory fixed-window counter keyed by caller
// identity. LIMITATION: the counter lives in this process's memory, so on a
// multi-instance Render deployment each instance keeps its own window (the
// effective limit is max × instances) and a restart resets it. It is a
// best-effort runaway-loop / abuse backstop, not a distributed quota. Swap the
// Map for Redis (or Upstash) if a hard cross-instance limit is required.
// ─────────────────────────────────────────────────────────────────────────────

const REALM = "ai-campaign-banner";

const SAFE_METHODS = new Set(["GET", "HEAD", "OPTIONS"]);

// Fixed-window rate limit for mutation routes.
const RATE_LIMIT_WINDOW_MS = 60_000;
const RATE_LIMIT_MAX = Number(process.env.BANNER_API_RATE_LIMIT_PER_MIN ?? "60");

interface RateBucket {
  count: number;
  resetAt: number;
}
const rateBuckets = new Map<string, RateBucket>();

function isProd(): boolean {
  return process.env.NODE_ENV === "production";
}

/** Constant-time-ish string compare (edge runtime has no crypto.timingSafeEqual). */
function safeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let mismatch = 0;
  for (let i = 0; i < a.length; i++) mismatch |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return mismatch === 0;
}

function basicAuthConfigured(): boolean {
  return Boolean(process.env.BASIC_AUTH_USER && process.env.BASIC_AUTH_PASSWORD);
}

/** Returns the authenticated Basic Auth username, or null when absent/invalid. */
function basicAuthUser(request: NextRequest): string | null {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) return null;
  const header = request.headers.get("authorization");
  if (!header) return null;
  const [scheme, encoded] = header.split(" ");
  if (scheme !== "Basic" || !encoded) return null;
  try {
    const decoded = atob(encoded);
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    const presentedUser = decoded.slice(0, idx);
    const presentedPass = decoded.slice(idx + 1);
    if (safeEqual(presentedUser, user) && safeEqual(presentedPass, password)) {
      return presentedUser;
    }
  } catch {
    // fall through
  }
  return null;
}

/** Extract the presented internal key from either accepted header. */
function presentedInternalKey(request: NextRequest): string | null {
  const x = request.headers.get("x-internal-api-key");
  if (x) return x.trim();
  const auth = request.headers.get("authorization");
  const m = auth ? /^Bearer\s+(.+)$/.exec(auth) : null;
  return m ? m[1].trim() : null;
}

function unauthorizedBasic(): NextResponse {
  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

function jsonError(status: number, code: string, message: string, extra?: Record<string, unknown>): NextResponse {
  return NextResponse.json({ error: code, message, ...extra }, { status });
}

/** Fixed-window rate check. Returns retry-after seconds when limited, else null. */
function rateLimited(identity: string): number | null {
  if (!Number.isFinite(RATE_LIMIT_MAX) || RATE_LIMIT_MAX <= 0) return null;
  const now = Date.now();
  const bucket = rateBuckets.get(identity);
  if (!bucket || now >= bucket.resetAt) {
    rateBuckets.set(identity, { count: 1, resetAt: now + RATE_LIMIT_WINDOW_MS });
    return null;
  }
  if (bucket.count >= RATE_LIMIT_MAX) {
    return Math.max(1, Math.ceil((bucket.resetAt - now) / 1000));
  }
  bucket.count += 1;
  return null;
}

/** Guard for mutation / cost /api routes. Returns a response to short-circuit, or null to continue. */
function guardApiMutation(request: NextRequest): NextResponse | null {
  const devBypass = !isProd() && process.env.ALLOW_UNAUTHENTICATED_DEV_API === "true";
  const internalKey = (process.env.BANNER_INTERNAL_API_KEY ?? "").trim();
  const presented = presentedInternalKey(request);
  const keyValid = internalKey.length > 0 && presented !== null && safeEqual(presented, internalKey);
  const basicUser = basicAuthUser(request);
  const hasBasic = basicAuthConfigured();

  // Decide the caller identity (used for rate-limit keying + allow/deny).
  let identity: string | null = null;
  if (devBypass) identity = "dev-bypass";
  else if (keyValid) identity = "svc:internal";
  else if (basicUser) identity = `basic:${basicUser}`;

  if (!identity) {
    // Fail closed in production when NO auth mechanism is configured at all.
    if (isProd() && internalKey.length === 0 && !hasBasic) {
      return jsonError(
        503,
        "server_auth_not_configured",
        "Mutation routes require BANNER_INTERNAL_API_KEY (or Basic Auth) to be configured in production.",
      );
    }
    // A credential was presented but did not validate → 403; otherwise → 401.
    const credentialPresented = presented !== null || request.headers.get("authorization") !== null;
    if (credentialPresented) {
      return jsonError(403, "forbidden", "Invalid API credentials.");
    }
    const res = jsonError(
      401,
      "unauthorized",
      "Missing API credentials. Send Authorization: Bearer <key> or x-internal-api-key: <key>.",
    );
    // Let a browser reach the Basic Auth prompt when that's the intended path.
    if (hasBasic) res.headers.set("WWW-Authenticate", `Basic realm="${REALM}", charset="UTF-8"`);
    return res;
  }

  const retryAfter = rateLimited(identity);
  if (retryAfter !== null) {
    return jsonError(429, "rate_limited", "Too many requests. Slow down.", { retryAfterSeconds: retryAfter });
  }
  return null;
}

export function middleware(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  const method = request.method.toUpperCase();
  const isApi = pathname.startsWith("/api/");
  const isMutation = isApi && !SAFE_METHODS.has(method);

  // Layer 2: mutation / cost API routes get the internal-key guard.
  if (isMutation) {
    const blocked = guardApiMutation(request);
    if (blocked) return blocked;
    return NextResponse.next();
  }

  // Layer 1: everything else (pages + GET /api reads) — Basic Auth if configured.
  if (basicAuthConfigured() && basicAuthUser(request) === null) {
    return unauthorizedBasic();
  }
  return NextResponse.next();
}

// Only run on real pages + API — skip Next.js internals so the 401 doesn't
// break asset prefetches. The browser still sends cached credentials on those,
// so once authed, everything works.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
