/**
 * LegalReviewTask service.
 *
 * Review tasks are created automatically by:
 * - obligation creation (obligation_draft)
 * - bundle publish request (bundle_publish)
 * - source diff detection (source_diff) — future
 *
 * They flow: open → in_progress → decided
 */

import { prisma, type DbClient } from "../../db";

export interface CreateReviewTaskInput {
  kind: string;
  refType: string;
  refId: number;
  title: string;
  assignee?: string;
}

export async function createReviewTask(input: CreateReviewTaskInput) {
  return prisma.legalReviewTask.create({
    data: {
      kind: input.kind,
      refType: input.refType,
      refId: input.refId,
      title: input.title,
      status: "open",
      assignee: input.assignee ?? null,
    },
  });
}

export async function assignTask(id: number, assignee: string, db: DbClient = prisma) {
  return db.legalReviewTask.update({
    where: { id },
    data: { assignee, status: "in_progress" },
  });
}

export async function decideTask(
  id: number,
  decision: "approved" | "rejected" | "needs_changes",
  decidedBy: string,
  note?: string,
  db: DbClient = prisma
) {
  return db.legalReviewTask.update({
    where: { id },
    data: {
      status: "decided",
      decision,
      decidedBy,
      decidedAt: new Date(),
      note: note ?? null,
    },
  });
}

export async function listTasks(filters: {
  status?: string;
  kind?: string;
  assignee?: string;
}) {
  return prisma.legalReviewTask.findMany({
    where: {
      ...(filters.status ? { status: filters.status } : {}),
      ...(filters.kind ? { kind: filters.kind } : {}),
      ...(filters.assignee ? { assignee: filters.assignee } : {}),
    },
    orderBy: [{ status: "asc" }, { createdAt: "desc" }],
    take: 100,
  });
}

export async function getTask(id: number, db: DbClient = prisma) {
  return db.legalReviewTask.findUnique({ where: { id } });
}
