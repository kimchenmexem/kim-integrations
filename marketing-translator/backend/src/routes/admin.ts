/**
 * /api/admin/* — minimal admin management surface.
 *
 *   GET    /users                     ADMIN            list users + identity summaries
 *   PATCH  /users/:id/role            ADMIN            change a user's role
 *   PATCH  /users/:id/active          ADMIN            activate / deactivate a user
 *   GET    /audit-logs                MANAGER | ADMIN  paginated audit log read
 *
 * User-management mutations write their audit row inside the same Prisma
 * $transaction via writeAuditTx, so the mutation + audit commit together
 * (fail-closed) — Step 6.1's hardened pattern reused.
 *
 * See also the safety policy comment on the role / active handlers below.
 */

import { Router } from "express";
import { z } from "zod";
import { Prisma, Role } from "@prisma/client";
import { prisma } from "../db";
import { requireRole } from "../middleware/auth";
import { writeAuditTx } from "../services/audit";
import { asyncHandler } from "../middleware/asyncHandler";

const router = Router();

class HttpError extends Error {
  constructor(public status: number, message: string) { super(message); }
}

/**
 * Concurrency-safe last-active-ADMIN invariant.
 *
 * Postgres default isolation is READ COMMITTED, so a plain `count()` inside a
 * transaction reads a snapshot at statement-start and can't see an
 * as-yet-uncommitted mutation from another transaction. Two parallel
 * "deactivate the other admin" requests would both see the other as still
 * active and both proceed, ending the system with zero active admins.
 *
 * Fix: before the safety check, acquire `SELECT … FOR UPDATE` row locks on
 * every currently-active ADMIN row. Under READ COMMITTED, if another
 * transaction is already updating any of these rows, `FOR UPDATE` blocks
 * until that transaction commits, then re-evaluates the predicate against
 * the new row version (EvalPlanQual). So:
 *   T1 locks {A,B}, decides B is safe to deactivate (A still matches),
 *      updates B, commits.
 *   T2 was waiting. When T1 commits, T2 re-locks the predicate — now only
 *      {A} matches (B is inactive). T2's safety count (excluding target A)
 *      is 0 → T2 throws, T2 rolls back.
 * Exactly one winner; zero-admin state is unreachable.
 */
async function lockActiveAdmins(tx: Prisma.TransactionClient): Promise<void> {
  // We don't use the rows — we only want the exclusive locks.
  await tx.$queryRaw`SELECT id FROM "User" WHERE "role" = 'ADMIN' AND "isActive" = true FOR UPDATE`;
}

function publicUser(u: {
  id: number;
  email: string;
  fullName: string | null;
  role: Role;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: u.id,
    email: u.email,
    fullName: u.fullName,
    role: u.role,
    isActive: u.isActive,
    createdAt: u.createdAt,
    updatedAt: u.updatedAt,
  };
}

// ─── Users: list ──────────────────────────────────────────────────────
router.get(
  "/users",
  requireRole("ADMIN"),
  asyncHandler(async (_req, res) => {
    const users = await prisma.user.findMany({
      orderBy: { createdAt: "desc" },
      include: {
        identities: {
          select: { provider: true, providerUserId: true, createdAt: true },
        },
      },
    });
    res.json({
      users: users.map((u) => ({
        ...publicUser(u),
        identities: u.identities,
      })),
    });
  })
);

// ─── Users: change role ──────────────────────────────────────────────
//
// Safety policy:
//   • Cannot demote the last active ADMIN. This blocks both the
//     "demote someone else" case and the "demote myself when I'm the
//     only active ADMIN" case with a single check.
//   • Self-role-change is otherwise permitted — an ADMIN can willingly
//     step down to MANAGER as long as another active ADMIN exists.
//   • Same-role writes are a no-op; no audit row is produced.
const roleSchema = z.object({ role: z.nativeEnum(Role) });

router.patch(
  "/users/:id/role",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid user id." });
    const parsed = roleSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const { role } = parsed.data;
    const actor = req.authUser!;

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) throw new HttpError(404, "User not found.");
        if (target.role === role) return target;

        // Last-active-ADMIN guard. Only relevant when this mutation actually
        // reduces the active-admin count. Lock the full active-ADMIN set
        // before counting; see lockActiveAdmins() docblock for why.
        const demotingActiveAdmin =
          target.role === Role.ADMIN && role !== Role.ADMIN && target.isActive;
        if (demotingActiveAdmin) {
          await lockActiveAdmins(tx);
          const otherActiveAdmins = await tx.user.count({
            where: { role: Role.ADMIN, isActive: true, NOT: { id } },
          });
          if (otherActiveAdmins < 1) {
            throw new HttpError(409, "Cannot demote the last active ADMIN.");
          }
        }

        const after = await tx.user.update({ where: { id }, data: { role } });
        await writeAuditTx(tx, req, {
          action: "user.role_change",
          entityType: "User",
          entityId: id,
          before: { role: target.role, isActive: target.isActive },
          after: { role: after.role, isActive: after.isActive },
          metadata: { selfChange: id === actor.id },
        });
        return after;
      });
      res.json({ user: publicUser(updated) });
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  })
);

// ─── Users: activate / deactivate ────────────────────────────────────
//
// Safety policy:
//   • An ADMIN cannot deactivate themselves. Rationale: the immediate
//     consequence of self-deactivation is losing all admin access (the
//     auth middleware 403s inactive users on requireRole). This is a
//     trivial foot-gun and there is no product use-case for it today.
//   • Cannot deactivate the last active ADMIN, even if that ADMIN is
//     not the actor. Re-activation is always allowed.
const activeSchema = z.object({ isActive: z.boolean() });

router.patch(
  "/users/:id/active",
  requireRole("ADMIN"),
  asyncHandler(async (req, res) => {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid user id." });
    const parsed = activeSchema.safeParse(req.body);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const { isActive } = parsed.data;
    const actor = req.authUser!;

    try {
      const updated = await prisma.$transaction(async (tx) => {
        const target = await tx.user.findUnique({ where: { id } });
        if (!target) throw new HttpError(404, "User not found.");
        if (target.isActive === isActive) return target;

        if (!isActive && id === actor.id) {
          throw new HttpError(409, "Cannot deactivate yourself.");
        }
        if (!isActive && target.role === Role.ADMIN) {
          // Same concurrency-safe pattern as role-change: lock the full
          // active-ADMIN set before counting. See lockActiveAdmins() above.
          await lockActiveAdmins(tx);
          const otherActiveAdmins = await tx.user.count({
            where: { role: Role.ADMIN, isActive: true, NOT: { id } },
          });
          if (otherActiveAdmins < 1) {
            throw new HttpError(409, "Cannot deactivate the last active ADMIN.");
          }
        }

        const after = await tx.user.update({ where: { id }, data: { isActive } });
        await writeAuditTx(tx, req, {
          action: "user.activation_change",
          entityType: "User",
          entityId: id,
          before: { isActive: target.isActive, role: target.role },
          after: { isActive: after.isActive, role: after.role },
          metadata: { selfChange: id === actor.id },
        });
        return after;
      });
      res.json({ user: publicUser(updated) });
    } catch (err) {
      if (err instanceof HttpError) return res.status(err.status).json({ error: err.message });
      throw err;
    }
  })
);

// ─── Audit logs: list ─────────────────────────────────────────────────
//
// MANAGER can read (not mutate) — oversight without letting them change
// users. ADMIN can read. Filters are conjunctive. Pagination is
// capped at 200 rows per request; larger pulls must paginate.
const auditListSchema = z.object({
  userId: z.coerce.number().int().optional(),
  action: z.string().min(1).max(100).optional(),
  entityType: z.string().min(1).max(100).optional(),
  entityId: z.string().min(1).max(100).optional(),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

// ─── Review queue ───────────────────────────────────────────────────
//
// Recent TranslationOutput rows visible to REVIEWER+ so they can find
// translations needing feedback. Returns latest-first with a snippet of
// the parent job's source, the locale, the output text, the current
// approved flag, and the latest review (if any) summarised.
//
// `status` query filter:
//   "pending"   — outputs with no reviews yet
//   "approved"  — output.approved === true
//   "rejected"  — has at least one review and output.approved === false
//   "all"       — default
const reviewQueueSchema = z.object({
  status: z.enum(["pending", "approved", "rejected", "all"]).default("all"),
  limit: z.coerce.number().int().min(1).max(200).default(50),
  offset: z.coerce.number().int().min(0).default(0),
});

router.get(
  "/review-queue",
  requireRole("MANAGER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = reviewQueueSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const q = parsed.data;

    const where: Record<string, unknown> = {};
    if (q.status === "approved") where.approved = true;
    if (q.status === "rejected") {
      where.approved = false;
      where.reviews = { some: {} };
    }
    if (q.status === "pending") where.reviews = { none: {} };

    const [total, rows] = await Promise.all([
      prisma.translationOutput.count({ where }),
      prisma.translationOutput.findMany({
        where,
        orderBy: { createdAt: "desc" },
        skip: q.offset,
        take: q.limit,
        include: {
          job: {
            select: {
              id: true,
              sourceText: true,
              targetLocale: true,
              textType: true,
              createdByUserId: true,
              createdBy: { select: { email: true } },
            },
          },
          reviews: {
            orderBy: { createdAt: "desc" },
            take: 1,
            select: {
              id: true,
              decision: true,
              note: true,
              reviewerUserId: true,
              createdAt: true,
              reviewer: { select: { email: true } },
            },
          },
          _count: { select: { reviews: true } },
        },
      }),
    ]);

    res.json({
      total,
      limit: q.limit,
      offset: q.offset,
      outputs: rows.map((r) => ({
        outputId: r.id,
        outputText: r.outputText,
        approved: r.approved,
        score: r.score,
        createdAt: r.createdAt,
        reviewCount: r._count.reviews,
        job: r.job,
        latestReview: r.reviews[0] ?? null,
      })),
    });
  })
);

router.get(
  "/audit-logs",
  requireRole("MANAGER", "ADMIN"),
  asyncHandler(async (req, res) => {
    const parsed = auditListSchema.safeParse(req.query);
    if (!parsed.success) return res.status(400).json({ error: parsed.error.errors });
    const q = parsed.data;

    const where: Record<string, unknown> = {};
    if (q.userId !== undefined) where.userId = q.userId;
    if (q.action !== undefined) where.action = q.action;
    if (q.entityType !== undefined) where.entityType = q.entityType;
    if (q.entityId !== undefined) where.entityId = q.entityId;

    const [total, rows] = await Promise.all([
      prisma.auditLog.count({ where }),
      prisma.auditLog.findMany({
        where,
        orderBy: { id: "desc" },
        skip: q.offset,
        take: q.limit,
        include: { user: { select: { id: true, email: true, role: true } } },
      }),
    ]);

    res.json({ total, limit: q.limit, offset: q.offset, rows });
  })
);

export default router;
