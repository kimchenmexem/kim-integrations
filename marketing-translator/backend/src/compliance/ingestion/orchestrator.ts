/**
 * Compliance Ingestion Orchestrator
 *
 * Given a source adapter's result, persists SourceDocuments, creates
 * immutable SourceDocumentVersions (deduped by contentHash), logs the
 * SourceSyncRun, and returns a summary for diff detection.
 *
 * Design rules:
 *  - Adapters are pure functions: they return data, never touch the DB.
 *  - The orchestrator owns all DB writes.
 *  - Versions are immutable: same contentHash for a document → skip.
 */

import crypto from "crypto";
import { prisma } from "../../db";
import type { SourceAdapter, AdapterResult, DiscoveredDocument, DiscoveredVersion } from "./types";
import type { SourceFamilyCode } from "@mexem/shared";

export interface SyncRunSummary {
  runId: number;
  sourceCode: SourceFamilyCode;
  status: "success" | "failed" | "partial";
  documentsUpserted: number;
  versionsCreated: number;
  versionsSkipped: number;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

/** Hash function for content dedup. */
function sha256(text: string): string {
  return crypto.createHash("sha256").update(text, "utf8").digest("hex");
}

/**
 * Run a full sync for a single source.
 *
 * 1. Look up the RegulatorySource row by code.
 * 2. Create a SourceSyncRun (status = running).
 * 3. Call adapter.sync().
 * 4. Upsert documents, create new versions (deduped by contentHash).
 * 5. Finalise the SyncRun.
 */
export async function runSync(
  adapter: SourceAdapter,
  triggeredBy: string = "manual:unknown"
): Promise<SyncRunSummary> {
  const t0 = Date.now();
  const errors: string[] = [];

  // ── 1. Look up source ──────────────────────────────────────────────
  const source = await prisma.regulatorySource.findUnique({
    where: { code: adapter.sourceCode },
  });
  if (!source) {
    throw new Error(`RegulatorySource ${adapter.sourceCode} not found in DB. Run seed first.`);
  }

  // ── 2. Create sync run ─────────────────────────────────────────────
  const syncRun = await prisma.sourceSyncRun.create({
    data: {
      sourceId: source.id,
      triggeredBy,
      status: "running",
    },
  });

  let adapterResult: AdapterResult;
  try {
    // ── 3. Call adapter ──────────────────────────────────────────────
    adapterResult = await adapter.sync({
      baseUrl: source.baseUrl ?? undefined,
      maxItems: 50,
    });
  } catch (err: any) {
    const msg = err?.message ?? String(err);
    errors.push(`Adapter threw: ${msg}`);
    await finaliseSyncRun(syncRun.id, "failed", 0, 0, 0, errors);
    return {
      runId: syncRun.id,
      sourceCode: adapter.sourceCode,
      status: "failed",
      documentsUpserted: 0,
      versionsCreated: 0,
      versionsSkipped: 0,
      warnings: [],
      errors,
      durationMs: Date.now() - t0,
    };
  }

  // ── 4. Persist documents + versions ────────────────────────────────
  let documentsUpserted = 0;
  let versionsCreated = 0;
  let versionsSkipped = 0;

  // Index versions by externalRef for fast lookup
  const versionsByRef = new Map<string, DiscoveredVersion[]>();
  for (const v of adapterResult.versions) {
    const arr = versionsByRef.get(v.externalRef) ?? [];
    arr.push(v);
    versionsByRef.set(v.externalRef, arr);
  }

  for (const doc of adapterResult.documents) {
    try {
      // Upsert SourceDocument
      const dbDoc = await prisma.sourceDocument.upsert({
        where: {
          sourceId_externalRef: {
            sourceId: source.id,
            externalRef: doc.externalRef,
          },
        },
        update: {
          title: doc.title,
          url: doc.url ?? null,
          language: doc.language ?? null,
        },
        create: {
          sourceId: source.id,
          externalRef: doc.externalRef,
          title: doc.title,
          url: doc.url ?? null,
          language: doc.language ?? null,
        },
      });
      documentsUpserted++;

      // Create versions (immutable, deduped by contentHash)
      const versions = versionsByRef.get(doc.externalRef) ?? [];
      for (const ver of versions) {
        const contentHash = sha256(ver.parsedText);

        // Check for existing version with same hash → skip
        const existing = await prisma.sourceDocumentVersion.findFirst({
          where: { documentId: dbDoc.id, contentHash },
        });

        if (existing) {
          versionsSkipped++;
          continue;
        }

        await prisma.sourceDocumentVersion.create({
          data: {
            documentId: dbDoc.id,
            versionLabel: ver.versionLabel,
            contentHash,
            rawContent: ver.rawContent,
            parsedText: ver.parsedText,
            fetchedBy: `sync:${syncRun.id}`,
            effectiveFrom: ver.effectiveFrom ?? null,
            effectiveUntil: ver.effectiveUntil ?? null,
          },
        });
        versionsCreated++;
      }
    } catch (err: any) {
      errors.push(`Doc "${doc.externalRef}": ${err?.message ?? String(err)}`);
    }
  }

  // ── 5. Finalise sync run ───────────────────────────────────────────
  const status = errors.length > 0
    ? (documentsUpserted > 0 || versionsCreated > 0 ? "partial" : "failed")
    : "success";

  await finaliseSyncRun(syncRun.id, status, documentsUpserted, versionsCreated, 0, errors);

  return {
    runId: syncRun.id,
    sourceCode: adapter.sourceCode,
    status,
    documentsUpserted,
    versionsCreated,
    versionsSkipped,
    warnings: adapterResult.warnings,
    errors,
    durationMs: Date.now() - t0,
  };
}

async function finaliseSyncRun(
  id: number,
  status: string,
  documentsFetched: number,
  versionsCreated: number,
  diffsDetected: number,
  errors: string[]
) {
  await prisma.sourceSyncRun.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      documentsFetched,
      versionsCreated,
      diffsDetected,
      errorMessage: errors.length > 0 ? errors.join("\n") : null,
    },
  });
}
