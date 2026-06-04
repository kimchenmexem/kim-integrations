/**
 * ComplianceObligation CRUD + state machine.
 *
 * State machine:
 *   pending → reviewed → approved → superseded
 *                      → rejected
 *   rejected → pending  (re-open)
 *
 * Every state transition is auditable (createdBy / approvedBy fields +
 * LegalReviewTask created alongside).
 */

import { prisma, type DbClient } from "../../db";
import type { ObligationStatus } from "@mexem/shared";

const VALID_TRANSITIONS: Record<ObligationStatus, ObligationStatus[]> = {
  pending:    ["reviewed"],
  reviewed:   ["approved", "rejected"],
  approved:   ["superseded"],
  rejected:   ["pending"],
  superseded: [],
};

export function canTransition(from: ObligationStatus, to: ObligationStatus): boolean {
  return VALID_TRANSITIONS[from]?.includes(to) ?? false;
}

export interface CreateObligationInput {
  title: string;
  description: string;
  jurisdiction: string;
  localeCode?: string | null;
  category: string;
  severity: string;
  sourceRefs: unknown[];
  createdBy?: string;
}

export async function createObligation(input: CreateObligationInput, db: DbClient = prisma) {
  const obligation = await db.complianceObligation.create({
    data: {
      title: input.title,
      description: input.description,
      jurisdiction: input.jurisdiction,
      localeCode: input.localeCode ?? null,
      category: input.category,
      severity: input.severity,
      status: "pending",
      sourceRefsJson: JSON.stringify(input.sourceRefs),
      createdBy: input.createdBy ?? null,
    },
  });

  // Auto-create a review task
  await db.legalReviewTask.create({
    data: {
      kind: "obligation_draft",
      refType: "ComplianceObligation",
      refId: obligation.id,
      title: `Review obligation: ${input.title}`,
      status: "open",
    },
  });

  return obligation;
}

export async function updateObligation(id: number, data: Partial<CreateObligationInput>, db: DbClient = prisma) {
  const update: Record<string, unknown> = {};
  if (data.title !== undefined) update.title = data.title;
  if (data.description !== undefined) update.description = data.description;
  if (data.jurisdiction !== undefined) update.jurisdiction = data.jurisdiction;
  if (data.localeCode !== undefined) update.localeCode = data.localeCode;
  if (data.category !== undefined) update.category = data.category;
  if (data.severity !== undefined) update.severity = data.severity;
  if (data.sourceRefs !== undefined) update.sourceRefsJson = JSON.stringify(data.sourceRefs);

  return db.complianceObligation.update({ where: { id }, data: update });
}

export async function transitionObligation(
  id: number,
  targetStatus: ObligationStatus,
  actor: string,
  note?: string,
  db: DbClient = prisma
) {
  const obligation = await db.complianceObligation.findUnique({ where: { id } });
  if (!obligation) throw new Error(`Obligation ${id} not found.`);

  const currentStatus = obligation.status as ObligationStatus;
  if (!canTransition(currentStatus, targetStatus)) {
    throw new Error(`Invalid transition: ${currentStatus} → ${targetStatus}`);
  }

  const updateData: Record<string, unknown> = { status: targetStatus };
  if (targetStatus === "approved") {
    updateData.approvedBy = actor;
    updateData.approvedAt = new Date();
  }

  const updated = await db.complianceObligation.update({
    where: { id },
    data: updateData,
  });

  // Resolve any open review tasks for this obligation
  if (targetStatus === "approved" || targetStatus === "rejected") {
    await db.legalReviewTask.updateMany({
      where: {
        refType: "ComplianceObligation",
        refId: id,
        status: { in: ["open", "in_progress"] },
      },
      data: {
        status: "decided",
        decision: targetStatus === "approved" ? "approved" : "rejected",
        decidedBy: actor,
        decidedAt: new Date(),
        note: note ?? null,
      },
    });
  }

  return updated;
}

export async function listObligations(filters: {
  status?: string;
  jurisdiction?: string;
  localeCode?: string;
  category?: string;
}) {
  return prisma.complianceObligation.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.jurisdiction ? { jurisdiction: filters.jurisdiction } : {}),
      ...(filters.localeCode ? { localeCode: filters.localeCode } : {}),
      ...(filters.category ? { category: filters.category } : {}),
    },
    include: { rules: { where: { enabled: true } } },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
  });
}

export async function getObligation(id: number, db: DbClient = prisma) {
  return db.complianceObligation.findUnique({
    where: { id },
    include: { rules: true },
  });
}

/** Serialize JSON fields for API response */
export function serializeObligation(row: any) {
  return {
    ...row,
    sourceRefs: safeParse(row.sourceRefsJson, []),
    sourceRefsJson: undefined,
    rules: row.rules?.map(serializeRule),
  };
}

export function serializeRule(row: any) {
  return {
    ...row,
    config: safeParse(row.configJson, {}),
    configJson: undefined,
  };
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}
