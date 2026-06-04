/**
 * RegulatorySource / SourceDocument / SourceDocumentVersion management.
 *
 * Used by the admin upload routes (compliance-admin.ts). Each helper takes
 * an optional `db: DbClient` so the route can wrap the call + the audit
 * insert in a single $transaction (fail-closed audit pattern from Step 6.1).
 *
 * Version content dedup: contentHash = sha256(parsedText). The DB has
 * @@unique([documentId, contentHash]); we honour it by returning the
 * existing version row instead of throwing if the same text is uploaded
 * twice for the same document. This mirrors what the ingestion adapters
 * do during sync.
 */

import crypto from "crypto";
import { prisma, type DbClient } from "../../db";

// ─── Sources ──────────────────────────────────────────────────────────

export interface CreateSourceInput {
  code: string;            // stable identifier, uppercased — e.g. "FCA", "AMF"
  name: string;
  regulator: string;
  jurisdiction: string;    // EU | IT | FR | NL | BE | ES | GB | CY
  localeScope: string[];   // locales this source's publications target
  sourceType: string;      // REGULATION | DIRECTIVE | GUIDANCE | CIRCULAR | ...
  canonicality: string;    // PRIMARY | SECONDARY | ADVISORY
  parserKey?: string;      // adapter key — defaults to "manual"
  pollCadence?: string;    // on_demand | daily | weekly | monthly
  active?: boolean;
  baseUrl?: string | null;
  notes?: string | null;
}

export async function createSource(input: CreateSourceInput, db: DbClient = prisma) {
  return db.regulatorySource.create({
    data: {
      code: input.code.trim().toUpperCase(),
      name: input.name,
      regulator: input.regulator,
      jurisdiction: input.jurisdiction.trim().toUpperCase(),
      localeScope: JSON.stringify(input.localeScope ?? []),
      sourceType: input.sourceType,
      canonicality: input.canonicality,
      parserKey: input.parserKey ?? "manual",
      pollCadence: input.pollCadence ?? "on_demand",
      active: input.active ?? true,
      baseUrl: input.baseUrl ?? null,
      notes: input.notes ?? null,
    },
  });
}

// ─── Documents ────────────────────────────────────────────────────────

export interface CreateDocumentInput {
  sourceId: number;
  externalRef: string;     // e.g. "COBS 4.2", "Circular 1/2019"
  title: string;
  url?: string | null;
  language?: string | null;
  active?: boolean;
  notes?: string | null;
}

export async function createDocument(input: CreateDocumentInput, db: DbClient = prisma) {
  return db.sourceDocument.create({
    data: {
      sourceId: input.sourceId,
      externalRef: input.externalRef.trim(),
      title: input.title,
      url: input.url ?? null,
      language: input.language ?? null,
      active: input.active ?? true,
      notes: input.notes ?? null,
    },
  });
}

/**
 * Look up a source by its code (case-insensitive) or numeric id. Returns
 * `null` if neither matches. Supports the "/sources/:codeOrId/documents"
 * route's flexible path param.
 */
export async function findSourceByCodeOrId(codeOrId: string, db: DbClient = prisma) {
  const asNum = Number(codeOrId);
  if (Number.isInteger(asNum) && asNum > 0) {
    return db.regulatorySource.findUnique({ where: { id: asNum } });
  }
  return db.regulatorySource.findUnique({ where: { code: codeOrId.trim().toUpperCase() } });
}

// ─── Document versions ───────────────────────────────────────────────

export interface CreateVersionInput {
  documentId: number;
  versionLabel: string;
  /** Already-normalised text. We store this in both rawContent and parsedText. */
  parsedText: string;
  /** Free-form attribution string, e.g. "manual:<userEmail>" or "manual:<userId>". */
  fetchedBy: string;
  effectiveFrom?: Date | null;
  effectiveUntil?: Date | null;
}

export type CreateVersionResult = {
  version: Awaited<ReturnType<typeof prisma.sourceDocumentVersion.findFirst>>;
  /** True when the (documentId, contentHash) pair already existed and we returned it instead of inserting. */
  dedup: boolean;
};

export async function createDocumentVersion(
  input: CreateVersionInput,
  db: DbClient = prisma
): Promise<CreateVersionResult> {
  const contentHash = crypto.createHash("sha256").update(input.parsedText).digest("hex");

  const existing = await db.sourceDocumentVersion.findUnique({
    where: { documentId_contentHash: { documentId: input.documentId, contentHash } },
  });
  if (existing) return { version: existing, dedup: true };

  const created = await db.sourceDocumentVersion.create({
    data: {
      documentId: input.documentId,
      versionLabel: input.versionLabel.trim(),
      contentHash,
      // Manual uploads are pre-normalised by the operator; keep both columns
      // identical for the audit trail (rawContent is "what they pasted",
      // parsedText is "what the runtime would read"; they match here).
      rawContent: input.parsedText,
      parsedText: input.parsedText,
      fetchedBy: input.fetchedBy,
      effectiveFrom: input.effectiveFrom ?? null,
      effectiveUntil: input.effectiveUntil ?? null,
    },
  });
  return { version: created, dedup: false };
}

// ─── Serialisers ─────────────────────────────────────────────────────

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export function serialiseSource(row: {
  id: number;
  code: string;
  name: string;
  regulator: string;
  jurisdiction: string;
  localeScope: string;
  sourceType: string;
  canonicality: string;
  parserKey: string;
  pollCadence: string;
  active: boolean;
  baseUrl: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    regulator: row.regulator,
    jurisdiction: row.jurisdiction,
    localeScope: safeParse<string[]>(row.localeScope, []),
    sourceType: row.sourceType,
    canonicality: row.canonicality,
    parserKey: row.parserKey,
    pollCadence: row.pollCadence,
    active: row.active,
    baseUrl: row.baseUrl,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}
