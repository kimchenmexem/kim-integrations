/**
 * Central environment configuration for the backend.
 *
 * Two responsibilities:
 *  1. Validate that every variable required for production is present.
 *     Call validateConfig() once at process start (index.ts), before any
 *     module that depends on env vars is imported.
 *  2. Export a typed `config` object so call sites have a single, named
 *     source of truth instead of scattered process.env references.
 *
 * Required vs optional rules:
 *  - DATABASE_URL   : always required — must be a full PostgreSQL connection string.
 *  - OPENAI_API_KEY : always required — every translation call needs it.
 *  - ADMIN_TOKEN    : always required — a missing/placeholder token is a
 *                     security misconfiguration, not a soft warning.
 *  - ALLOWED_ORIGINS: required in production; defaults to localhost in dev
 *                     so the frontend dev server works out of the box.
 *
 * All quality-gate and decision-layer tuning vars are optional; they have
 * safe defaults and the app functions correctly without them.
 */

// ─── Types ────────────────────────────────────────────────────────────────────

export interface QualityGateConfig {
  enabled: boolean;
  reviewModel: string;
  repairModel: string;
  minPassingScore: number;
  repairEnabled: boolean;
  regenerationEnabled: boolean;
}

export interface DecisionLayerConfig {
  semanticWeight: number;
  independentWeight: number;
  disagreementPenalty: number;
  lowRiskThreshold: number;
  highRiskThreshold: number;
  humanReviewThreshold: number;
}

export interface AppConfig {
  // ── Core ─────────────────────────────────────────────────────────────
  nodeEnv: string;
  isDev: boolean;
  isProd: boolean;
  port: number;

  // ── Database ─────────────────────────────────────────────────────────
  databaseUrl: string;

  // ── OpenAI ───────────────────────────────────────────────────────────
  openaiApiKey: string;
  /** Override the OpenAI API base URL (used in integration tests only). */
  openaiBaseUrl: string | undefined;
  /** Passed to the SDK as maxRetries; undefined = SDK default (2). */
  openaiMaxRetries: number | undefined;

  // ── Security ──────────────────────────────────────────────────────────
  /**
   * Legacy shared secret. Kept for emergency/test use only — no route in the
   * main app flow still checks it. Do not wire new routes to this.
   */
  adminToken: string;

  // ── Clerk (authentication) ────────────────────────────────────────────
  /** Secret key from Clerk dashboard — backend only. Empty = Clerk disabled. */
  clerkSecretKey: string;
  /** Publishable key — must match the one the frontend uses for the SDK. */
  clerkPublishableKey: string;
  /** Convenience flag: true iff both Clerk keys are present. */
  clerkEnabled: boolean;

  // ── Authorization ─────────────────────────────────────────────────────
  /**
   * Emails that are promoted to ADMIN *only on first local-user creation*.
   * Never flips an existing user. Compared case-insensitively. Empty array
   * means no bootstrap promotion (all new users get role=USER).
   */
  initialAdminEmails: string[];

  // ── Service-to-service auth (campaign-copy only) ─────────────────────
  /**
   * Static shared secret accepted by /api/campaign-copy as
   * `Authorization: Bearer <key>`. Empty = endpoint falls back to Clerk.
   * Scoped to this one route — no other endpoint consults it.
   */
  campaignCopyApiKey: string;

  // ── CORS ──────────────────────────────────────────────────────────────
  /** Explicit list of allowed origins. Defaults to dev localhost origins. */
  allowedOrigins: string[];

  // ── Reverse-proxy trust ───────────────────────────────────────────────
  /**
   * Value fed to Express's `app.set("trust proxy", ...)`. Governs whether
   * `req.ip` honours `X-Forwarded-For`. Accepted values (set via TRUST_PROXY):
   *   unset / "false" / "0" → false  (default — local dev, direct connections)
   *   "true" / "1"          → true   (trust every hop; dangerous with open internet)
   *   "<integer>"           → that many hops (Render / most PaaS: "1")
   *   "loopback" | "linklocal" | "uniquelocal" | CIDR | IP list → passed through
   */
  trustProxy: boolean | number | string;

  // ── Compliance bundles ────────────────────────────────────────────────
  complianceBundlesEnabled: boolean;
  bundleCacheTtlMs: number;

  // ── Quality gate ──────────────────────────────────────────────────────
  qualityGate: QualityGateConfig;

  // ── Decision layer ────────────────────────────────────────────────────
  decisionLayer: DecisionLayerConfig;

  // ── Logging ───────────────────────────────────────────────────────────
  uncertainCaseLogPath: string;
}

// ─── Placeholder sentinel ─────────────────────────────────────────────────────
// Values copied verbatim from .env.example that must never reach production.
const INSECURE_PLACEHOLDERS = new Set([
  "change-me-to-a-long-random-value",
  "your-openai-api-key",
]);

// ─── Validation ───────────────────────────────────────────────────────────────

/**
 * Validates that the process has all environment variables required to run.
 * Call this once, as the very first thing in index.ts, before any other import
 * or business-logic module executes.
 *
 * Behaviour:
 *  - Always required: DATABASE_URL, OPENAI_API_KEY, ADMIN_TOKEN.
 *  - Production-only required: ALLOWED_ORIGINS.
 *  - Security check: insecure placeholder values are rejected in production.
 *  - On failure: prints a human-readable list of all problems, then exits 1.
 */
export function validateConfig(): void {
  const env = process.env;
  const nodeEnv = env.NODE_ENV ?? "development";
  const isProd = nodeEnv === "production";
  const errors: string[] = [];

  // ── Always required ──────────────────────────────────────────────────
  if (!env.DATABASE_URL) {
    errors.push("DATABASE_URL is not set.");
  }

  if (!env.OPENAI_API_KEY || env.OPENAI_API_KEY.trim() === "") {
    errors.push("OPENAI_API_KEY is not set.");
  } else if (isProd && INSECURE_PLACEHOLDERS.has(env.OPENAI_API_KEY.trim())) {
    errors.push("OPENAI_API_KEY contains an insecure placeholder value.");
  }

  // ADMIN_TOKEN is deprecated. No live route consults it anymore; it is kept
  // only so legacy tests / emergency tools can still run. If set, reject the
  // placeholder value in production so a stray copy never ships. If unset,
  // silently ignore.
  if (isProd && env.ADMIN_TOKEN && INSECURE_PLACEHOLDERS.has(env.ADMIN_TOKEN.trim())) {
    errors.push("ADMIN_TOKEN contains an insecure placeholder value. Generate a real secret or remove it.");
  }

  // ── Production-only required ─────────────────────────────────────────
  if (isProd && !env.ALLOWED_ORIGINS) {
    errors.push(
      "ALLOWED_ORIGINS is not set. In production this must be the explicit frontend URL(s), " +
      "e.g. ALLOWED_ORIGINS=https://app.example.com"
    );
  }

  if (isProd) {
    if (!env.CLERK_SECRET_KEY || env.CLERK_SECRET_KEY.trim() === "") {
      errors.push("CLERK_SECRET_KEY is not set. In production Clerk auth must be configured.");
    }
    if (!env.CLERK_PUBLISHABLE_KEY || env.CLERK_PUBLISHABLE_KEY.trim() === "") {
      errors.push("CLERK_PUBLISHABLE_KEY is not set. In production Clerk auth must be configured.");
    }
  } else {
    // Dev convenience: warn instead of failing so the app boots without Clerk keys.
    const hasSecret = !!(env.CLERK_SECRET_KEY && env.CLERK_SECRET_KEY.trim());
    const hasPub = !!(env.CLERK_PUBLISHABLE_KEY && env.CLERK_PUBLISHABLE_KEY.trim());
    if (hasSecret !== hasPub) {
      console.warn(
        "[config] ⚠ Only one of CLERK_SECRET_KEY / CLERK_PUBLISHABLE_KEY is set — Clerk is disabled. " +
        "Set both or neither."
      );
    } else if (!hasSecret) {
      console.warn("[config] ⚠ Clerk keys not set — /api/auth/* will return 503. Admin-token routes still work.");
    }
  }

  if (errors.length > 0) {
    console.error("\n[config] ✖ Backend cannot start — environment is misconfigured:\n");
    errors.forEach((e) => console.error(`  • ${e}`));
    console.error(
      "\nCopy .env.example to .env, fill in the required values, and restart.\n"
    );
    process.exit(1);
  }
}

// ─── Parsed config object ─────────────────────────────────────────────────────

function parseOptionalInt(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = Number(raw);
  return Number.isNaN(n) ? fallback : n;
}

function parseOptionalFloat(raw: string | undefined, fallback: number): number {
  if (raw === undefined || raw === "") return fallback;
  const n = parseFloat(raw);
  return Number.isNaN(n) ? fallback : n;
}

function parseFlag(raw: string | undefined, defaultOn: boolean): boolean {
  if (raw === undefined || raw === "") return defaultOn;
  return raw !== "false";
}

function parseTrustProxy(raw: string | undefined): boolean | number | string {
  if (raw === undefined || raw.trim() === "") return false;
  const v = raw.trim();
  if (v === "false" || v === "0") return false;
  if (v === "true") return true;
  const asNum = Number(v);
  if (Number.isInteger(asNum) && asNum >= 0) return asNum;
  // Anything else — "loopback", CIDR, comma-separated IPs — pass through to Express.
  return v;
}

/**
 * Build the typed config object from process.env.
 * Must only be called after validateConfig() has passed.
 */
function buildConfig(): AppConfig {
  const env = process.env;
  const nodeEnv = env.NODE_ENV ?? "development";
  const isDev = nodeEnv !== "production";
  const isProd = !isDev;

  const rawOrigins = env.ALLOWED_ORIGINS;
  const allowedOrigins: string[] = rawOrigins
    ? rawOrigins.split(",").map((o) => o.trim()).filter(Boolean)
    : ["http://localhost:5173", "http://localhost:3000"];

  const mrRaw = env.OPENAI_MAX_RETRIES;
  let openaiMaxRetries: number | undefined;
  if (mrRaw !== undefined && mrRaw !== "") {
    const mr = Number(mrRaw);
    if (!Number.isNaN(mr)) openaiMaxRetries = mr;
  }

  return {
    nodeEnv,
    isDev,
    isProd,
    port: parseOptionalInt(env.PORT, 4000),

    databaseUrl: env.DATABASE_URL as string,

    openaiApiKey: env.OPENAI_API_KEY as string,
    openaiBaseUrl: env.OPENAI_BASE_URL || undefined,
    openaiMaxRetries,

    adminToken: (env.ADMIN_TOKEN ?? "").trim(),

    clerkSecretKey: (env.CLERK_SECRET_KEY ?? "").trim(),
    clerkPublishableKey: (env.CLERK_PUBLISHABLE_KEY ?? "").trim(),
    clerkEnabled:
      !!(env.CLERK_SECRET_KEY && env.CLERK_SECRET_KEY.trim()) &&
      !!(env.CLERK_PUBLISHABLE_KEY && env.CLERK_PUBLISHABLE_KEY.trim()),

    initialAdminEmails: (env.INITIAL_ADMIN_EMAILS ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter((e) => e.length > 0),

    campaignCopyApiKey: (env.CAMPAIGN_COPY_API_KEY ?? "").trim(),

    allowedOrigins,

    trustProxy: parseTrustProxy(env.TRUST_PROXY),

    complianceBundlesEnabled: parseFlag(env.COMPLIANCE_BUNDLES_ENABLED, true),
    bundleCacheTtlMs: parseOptionalInt(env.BUNDLE_CACHE_TTL_MS, 60_000),

    qualityGate: {
      enabled: parseFlag(env.QG_ENABLED, true),
      reviewModel: env.QG_REVIEW_MODEL ?? "gpt-4o-mini",
      repairModel: env.QG_REPAIR_MODEL ?? "gpt-4o-mini",
      minPassingScore: parseOptionalFloat(env.QG_MIN_PASSING_SCORE, 0.75),
      repairEnabled: parseFlag(env.QG_REPAIR_ENABLED, true),
      regenerationEnabled: parseFlag(env.QG_REGENERATION_ENABLED, true),
    },

    decisionLayer: {
      semanticWeight: parseOptionalFloat(env.SEMANTIC_WEIGHT, 0.7),
      independentWeight: parseOptionalFloat(env.INDEPENDENT_WEIGHT, 0.3),
      disagreementPenalty: parseOptionalFloat(env.DISAGREEMENT_PENALTY, 10),
      lowRiskThreshold: parseOptionalFloat(env.LOW_RISK_THRESHOLD, 70),
      highRiskThreshold: parseOptionalFloat(env.HIGH_RISK_THRESHOLD, 85),
      humanReviewThreshold: parseOptionalFloat(env.HUMAN_REVIEW_THRESHOLD, 55),
    },

    uncertainCaseLogPath: env.UNCERTAIN_CASE_LOG_PATH ?? "./uncertain-cases.log",
  };
}

// Eagerly built after the module is imported. validateConfig() must have run
// first so the non-null assertions below are safe.
export const config: AppConfig = buildConfig();
