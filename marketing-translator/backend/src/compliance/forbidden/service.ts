/**
 * ForbiddenPhrase service.
 *
 * Compliance-driven banned phrases that the translation pipeline must never
 * emit. Two ingestion paths:
 *   1. Admin/manager via the Compliance Admin → Forbidden Phrases UI.
 *   2. Reviewer via POST /api/review/:outputId — when rejecting an output the
 *      reviewer can attach `forbiddenPhrases: string[]`. Each phrase becomes
 *      a row scoped to the output's targetLocale, with `triggeringReviewId`
 *      pointing back at the review for provenance.
 *
 * Soft-deactivate (active=false) instead of hard-delete: keeps the audit
 * narrative honest — "this phrase was banned at time T, then unbanned by
 * user X at time T+n" — and stable FKs from old reviews.
 *
 * The runtime translation prompt builders call
 * listActiveForbiddenPhrasesForLocale() and inject the strings into the
 * system prompt. Phrase matching at runtime is the AI's job, not ours; we
 * just hand it the exhaustive list.
 */

import { prisma, type DbClient } from "../../db";

export interface AddForbiddenPhraseInput {
  phrase: string;
  /** Target locale code (e.g. "it-IT"). Empty string = all locales. */
  localeCode: string;
  reason?: string | null;
  addedByUserId: number;
  triggeringReviewId?: number | null;
}

export async function addForbiddenPhrase(
  input: AddForbiddenPhraseInput,
  db: DbClient = prisma
) {
  return db.forbiddenPhrase.create({
    data: {
      phrase: input.phrase.trim(),
      localeCode: input.localeCode.trim(),
      reason: input.reason ?? null,
      active: true,
      addedByUserId: input.addedByUserId,
      triggeringReviewId: input.triggeringReviewId ?? null,
    },
  });
}

/**
 * Idempotent variant — used by the review-submission path where the same
 * reviewer might flag the same phrase twice. If a row already exists for
 * (localeCode, phrase) we return it unchanged; if it was deactivated, we
 * reactivate it. Either way, no @@unique violation reaches the caller.
 */
export async function upsertActiveForbiddenPhrase(
  input: AddForbiddenPhraseInput,
  db: DbClient = prisma
) {
  const existing = await db.forbiddenPhrase.findUnique({
    where: { localeCode_phrase: { localeCode: input.localeCode.trim(), phrase: input.phrase.trim() } },
  });
  if (existing) {
    if (existing.active) return { row: existing, created: false, reactivated: false };
    const reactivated = await db.forbiddenPhrase.update({
      where: { id: existing.id },
      data: { active: true, addedByUserId: input.addedByUserId, triggeringReviewId: input.triggeringReviewId ?? null, reason: input.reason ?? existing.reason },
    });
    return { row: reactivated, created: false, reactivated: true };
  }
  const created = await addForbiddenPhrase(input, db);
  return { row: created, created: true, reactivated: false };
}

export async function deactivateForbiddenPhrase(id: number, db: DbClient = prisma) {
  return db.forbiddenPhrase.update({
    where: { id },
    data: { active: false },
  });
}

export async function listForbiddenPhrases(
  filters: { localeCode?: string; activeOnly?: boolean } = {},
  db: DbClient = prisma
) {
  return db.forbiddenPhrase.findMany({
    where: {
      ...(filters.localeCode !== undefined ? { localeCode: filters.localeCode } : {}),
      ...(filters.activeOnly ? { active: true } : {}),
    },
    orderBy: [{ active: "desc" }, { createdAt: "desc" }],
  });
}

/**
 * Used by the runtime translation prompt builders. Returns active phrases
 * scoped to the target locale PLUS the wildcard set (localeCode = "").
 */
export async function listActiveForbiddenPhrasesForLocale(
  locale: string,
  db: DbClient = prisma
) {
  const rows = await db.forbiddenPhrase.findMany({
    where: { active: true, localeCode: { in: [locale, ""] } },
    select: { phrase: true },
    orderBy: { id: "asc" },
  });
  return rows.map((r) => r.phrase);
}

/**
 * Format the active forbidden phrases as a system-prompt block. Returns "" if
 * the list is empty so the caller can concatenate unconditionally.
 */
export function formatForbiddenPhrasesBlock(phrases: string[]): string {
  if (phrases.length === 0) return "";
  const list = phrases.map((p) => `"${p}"`).join(", ");
  return `\nCOMPLIANCE — BANNED PHRASES (NEVER use any of these in the translation, no matter what the source says): ${list}.`;
}
