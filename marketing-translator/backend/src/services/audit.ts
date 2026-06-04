/**
 * Durable audit trail for security- and compliance-sensitive mutations.
 *
 * Two entry points:
 *
 *   writeAuditTx(db, req, input)
 *     Transaction-aware. Accepts either the global prisma client or a
 *     $transaction-scoped client. Always throws on failure — callers that
 *     pass a tx MUST be inside a transaction so a throw rolls the whole
 *     operation back. This is the right tool for compliance-admin mutations
 *     where untracked writes are worse than failed writes.
 *
 *   writeAudit(req, input, { failClosed? })
 *     Best-effort wrapper used outside transactions. Logs failures to stderr
 *     and returns; pass { failClosed: true } to rethrow on failure.
 *
 * ───── IP capture ─────────────────────────────────────────────────────
 * Reads `req.ip`, which Express computes from `X-Forwarded-For` only when
 * `app.set("trust proxy", ...)` has been configured. App-level trust is set
 * from the TRUST_PROXY env var; see config.ts + app.ts. We never parse
 * `X-Forwarded-For` directly here — that would bypass the trust model.
 * ──────────────────────────────────────────────────────────────────────
 */

import type { Request } from "express";
import { prisma, type DbClient } from "../db";

export type AuditInput = {
  action: string;
  entityType: string;
  entityId?: number | string | null;
  before?: unknown;
  after?: unknown;
  metadata?: Record<string, unknown>;
};

export type AuditOptions = {
  /** When true, rethrow on audit-write failure. Default: best-effort swallow. */
  failClosed?: boolean;
};

const MAX_STRING_LEN = 2000;

function truncate(value: unknown): unknown {
  if (typeof value === "string") {
    if (value.length <= MAX_STRING_LEN) return value;
    return `${value.slice(0, 200)}…${value.slice(-100)} (${value.length} chars)`;
  }
  if (Array.isArray(value)) return value.map(truncate);
  if (value !== null && typeof value === "object") {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(value)) out[k] = truncate(v);
    return out;
  }
  return value;
}

// ─── TEST-ONLY failure-injection seam ─────────────────────────────────
// Used by the rollback-verification harness to prove that a forced audit
// failure rolls back the corresponding compliance-admin mutation. Hardened
// three ways: refuses in production; off by default; throwing branch is only
// reachable when __setTestAuditFailureInjection(true) has been called.
let testInjectFailure = false;
export function __setTestAuditFailureInjection(value: boolean): void {
  if (process.env.NODE_ENV === "production") {
    throw new Error("[audit] test-only failure-injection seam called in production");
  }
  testInjectFailure = value;
}
// ──────────────────────────────────────────────────────────────────────

function buildPayload(req: Request, input: AuditInput) {
  const ip = typeof req.ip === "string" && req.ip.length > 0 ? req.ip : null;
  const userAgent =
    typeof req.headers["user-agent"] === "string"
      ? req.headers["user-agent"].slice(0, 500)
      : null;

  return {
    userId: req.authUser?.id ?? null,
    action: input.action,
    entityType: input.entityType,
    entityId: input.entityId != null ? String(input.entityId) : null,
    beforeJson: input.before === undefined ? undefined : (truncate(input.before) as object),
    afterJson: input.after === undefined ? undefined : (truncate(input.after) as object),
    metadataJson:
      input.metadata === undefined ? undefined : (truncate(input.metadata) as object),
    ipAddress: ip,
    userAgent,
  };
}

/**
 * Transaction-aware audit write. Always throws on failure — the caller is
 * responsible for being inside a $transaction so the throw propagates and
 * rolls back the pending mutation.
 */
export async function writeAuditTx(
  db: DbClient,
  req: Request,
  input: AuditInput
): Promise<void> {
  if (testInjectFailure) {
    throw new Error("[audit] injected test failure");
  }
  await db.auditLog.create({ data: buildPayload(req, input) });
}

/**
 * Best-effort audit write outside transactions. Pass `failClosed: true` to
 * rethrow on failure instead of swallowing; the caller is responsible for
 * deciding whether to invert the user's main action in that case.
 */
export async function writeAudit(
  req: Request,
  input: AuditInput,
  options: AuditOptions = {}
): Promise<void> {
  try {
    await writeAuditTx(prisma, req, input);
  } catch (err) {
    console.error(
      `[audit] failed to write ${input.action} (${input.entityType}:${input.entityId ?? "-"}):`,
      err
    );
    if (options.failClosed) throw err;
  }
}

export function summariseGlossaryTerm(t: {
  id: number;
  sourceTerm: string;
  targetTerm: string;
  localeCode: string | null;
  required: boolean;
  forbidden: boolean;
  notes: string | null;
}) {
  return {
    id: t.id,
    sourceTerm: t.sourceTerm,
    targetTerm: t.targetTerm,
    localeCode: t.localeCode,
    required: t.required,
    forbidden: t.forbidden,
    notes: t.notes,
  };
}
