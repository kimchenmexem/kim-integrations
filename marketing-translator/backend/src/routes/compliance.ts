import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { runSync } from "../compliance/ingestion/orchestrator";
import { getAdapter, getDedicatedAdapterCodes } from "../compliance/ingestion/adapters";
import { diffLatestVersions } from "../compliance/ingestion/diff";
import { runComplianceCheck } from "../services/complianceCheck";
import type { SourceFamilyCode } from "@mexem/shared";
import { requireAuth, requireRole } from "../middleware/auth";

const router = Router();

// ─── POST /api/compliance/check ─────────────────────────────────────
// Standalone compliance check (no translation, no rewrite by default).
// Reuses the published-bundle pipeline with transparent legacy fallback.
const SUPPORTED_LOCALES = ["it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES", "en-GB"] as const;

const complianceCheckSchema = z.object({
  text: z.string().min(1).max(10_000),
  locale: z.enum(SUPPORTED_LOCALES),
  withSuggestedFixes: z.boolean().optional(),
});

router.post("/check", requireAuth, async (req, res) => {
  try {
    const payload = complianceCheckSchema.parse(req.body);
    const result = await runComplianceCheck(payload);
    const authUser = req.authUser!;

    // Persist the check so the user can submit a feedback review on the
    // assessment ("you flagged this incorrectly" / "you missed X").
    // Modelled as a TranslationOutput with textType="compliance_check"
    // and outputText = the input (compliance check doesn't translate; the
    // "output" being reviewed is the assessment, captured in `validation`).
    // Persist failure is non-fatal — the user still gets the assessment.
    let outputId: number | undefined;
    let jobId: number | undefined;
    try {
      const persisted = await prisma.$transaction(async (tx) => {
        const job = await tx.translationJob.create({
          data: {
            sourceText: payload.text,
            sourceLanguage: "auto",
            targetLocale: payload.locale,
            textType: "compliance_check",
            persona: "compliance",
            tone: "compliance",
            outputCount: 1,
            status: "completed",
            createdByUserId: authUser.id,
          },
        });
        const output = await tx.translationOutput.create({
          data: {
            jobId: job.id,
            outputText: payload.text,
            version: 1,
            approved: false,
            validation: JSON.stringify({ complianceCheck: result }),
          },
        });
        await tx.translationOutputVersion.create({
          data: {
            translationOutputId: output.id,
            versionNumber: 1,
            eventType: "initial_generation",
            outputText: payload.text,
            approved: false,
            createdByUserId: authUser.id,
          },
        });
        return { jobId: job.id, outputId: output.id };
      });
      outputId = persisted.outputId;
      jobId = persisted.jobId;
    } catch (persistErr) {
      console.error("[compliance-check] persist failed (review unavailable for this call):", persistErr);
    }

    res.json({ ...result, outputId, jobId });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error("POST /api/compliance/check failed:", err);
    res.status(500).json({ error: err?.message ?? "Compliance check failed." });
  }
});

// ─── Serializers: unwrap JSON-encoded TEXT columns into real values ──

function serializeSource(row: any) {
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

function serializeBundle(row: any) {
  return {
    id: row.id,
    localeCode: row.localeCode,
    jurisdiction: row.jurisdiction,
    version: row.version,
    status: row.status,
    contentHash: row.contentHash,
    sourceRefs: safeParse<unknown[]>(row.sourceRefsJson, []),
    publishedAt: row.publishedAt,
    publishedBy: row.publishedBy,
    supersededAt: row.supersededAt,
    notes: row.notes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    // contentJson intentionally omitted from list views — fetch via GET /:id later
  };
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

// ─── GET /api/compliance/sources ─────────────────────────────────────
// Optional query filters: jurisdiction, active
router.get("/sources", async (req, res) => {
  try {
    const jurisdiction = typeof req.query.jurisdiction === "string" ? req.query.jurisdiction : undefined;
    const active = typeof req.query.active === "string" ? req.query.active === "true" : undefined;

    const sources = await prisma.regulatorySource.findMany({
      where: {
        ...(jurisdiction ? { jurisdiction } : {}),
        ...(active !== undefined ? { active } : {}),
      },
      orderBy: { code: "asc" },
    });

    res.json({ sources: sources.map(serializeSource) });
  } catch (err) {
    console.error("GET /api/compliance/sources failed:", err);
    res.status(500).json({ error: "Failed to list regulatory sources." });
  }
});

// ─── GET /api/compliance/sources/:codeOrId ───────────────────────────
// Accepts numeric id OR source code (e.g. "FCA"). Includes documents.
router.get("/sources/:codeOrId", async (req, res) => {
  try {
    const key = req.params.codeOrId;
    const isNumeric = /^\d+$/.test(key);

    const source = await prisma.regulatorySource.findFirst({
      where: isNumeric ? { id: Number(key) } : { code: key.toUpperCase() },
      include: { documents: { orderBy: { externalRef: "asc" } } },
    });

    if (!source) return res.status(404).json({ error: "Regulatory source not found." });

    res.json({
      source: serializeSource(source),
      documents: (source as any).documents ?? [],
    });
  } catch (err) {
    console.error("GET /api/compliance/sources/:codeOrId failed:", err);
    res.status(500).json({ error: "Failed to load regulatory source." });
  }
});

// ─── GET /api/compliance/documents ───────────────────────────────────
// Optional query filters: sourceId, active
router.get("/documents", async (req, res) => {
  try {
    const sourceId = typeof req.query.sourceId === "string" ? Number(req.query.sourceId) : undefined;
    const active = typeof req.query.active === "string" ? req.query.active === "true" : undefined;

    const documents = await prisma.sourceDocument.findMany({
      where: {
        ...(sourceId && !Number.isNaN(sourceId) ? { sourceId } : {}),
        ...(active !== undefined ? { active } : {}),
      },
      orderBy: [{ sourceId: "asc" }, { externalRef: "asc" }],
      take: 200,
    });

    res.json({ documents });
  } catch (err) {
    console.error("GET /api/compliance/documents failed:", err);
    res.status(500).json({ error: "Failed to list source documents." });
  }
});

// ─── GET /api/compliance/bundles ─────────────────────────────────────
// Optional query filters: localeCode, status, jurisdiction
router.get("/bundles", async (req, res) => {
  try {
    const localeCode = typeof req.query.localeCode === "string" ? req.query.localeCode : undefined;
    const status = typeof req.query.status === "string" ? req.query.status : undefined;
    const jurisdiction = typeof req.query.jurisdiction === "string" ? req.query.jurisdiction : undefined;

    const bundles = await prisma.ruleBundle.findMany({
      where: {
        ...(localeCode ? { localeCode } : {}),
        ...(status ? { status } : {}),
        ...(jurisdiction ? { jurisdiction } : {}),
      },
      orderBy: [{ localeCode: "asc" }, { createdAt: "desc" }],
    });

    res.json({ bundles: bundles.map(serializeBundle) });
  } catch (err) {
    console.error("GET /api/compliance/bundles failed:", err);
    res.status(500).json({ error: "Failed to list rule bundles." });
  }
});

// ─── POST /api/compliance/sync ───────────────────────────────────────
// Trigger sync for one source (?source=FCA) or all dedicated adapters (no param).
// Long-running — responds after completion.
router.post("/sync", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  try {
    const sourceParam = typeof req.query.source === "string" ? req.query.source.toUpperCase() : undefined;
    const codes: SourceFamilyCode[] = sourceParam
      ? [sourceParam as SourceFamilyCode]
      : getDedicatedAdapterCodes();

    const results = [];
    for (const code of codes) {
      const adapter = getAdapter(code);
      const summary = await runSync(adapter, "manual:api");
      results.push(summary);
    }

    res.json({ results });
  } catch (err: any) {
    console.error("POST /api/compliance/sync failed:", err);
    res.status(500).json({ error: err?.message ?? "Sync failed." });
  }
});

// ─── GET /api/compliance/sync-runs ───────────────────────────────────
// List recent sync runs. Optional filter: sourceCode
router.get("/sync-runs", async (req, res) => {
  try {
    const sourceCode = typeof req.query.sourceCode === "string" ? req.query.sourceCode : undefined;
    const where = sourceCode
      ? { source: { code: sourceCode.toUpperCase() } }
      : {};

    const runs = await prisma.sourceSyncRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { source: { select: { code: true, name: true } } },
    });

    res.json({ runs });
  } catch (err) {
    console.error("GET /api/compliance/sync-runs failed:", err);
    res.status(500).json({ error: "Failed to list sync runs." });
  }
});

// ─── GET /api/compliance/documents/:docId/versions ───────────────────
// List versions for a document, newest first.
router.get("/documents/:docId/versions", async (req, res) => {
  try {
    const docId = Number(req.params.docId);
    if (Number.isNaN(docId)) return res.status(400).json({ error: "Invalid document id." });

    const versions = await prisma.sourceDocumentVersion.findMany({
      where: { documentId: docId },
      orderBy: { fetchedAt: "desc" },
      select: {
        id: true,
        versionLabel: true,
        contentHash: true,
        fetchedAt: true,
        fetchedBy: true,
        effectiveFrom: true,
        effectiveUntil: true,
        // rawContent + parsedText deliberately excluded from list (large).
        // Fetch individually via GET /versions/:id if needed.
      },
    });

    res.json({ versions });
  } catch (err) {
    console.error("GET /api/compliance/documents/:docId/versions failed:", err);
    res.status(500).json({ error: "Failed to list document versions." });
  }
});

// ─── GET /api/compliance/documents/:docId/diff ───────────────────────
// Diff the latest two versions of a document.
router.get("/documents/:docId/diff", async (req, res) => {
  try {
    const docId = Number(req.params.docId);
    if (Number.isNaN(docId)) return res.status(400).json({ error: "Invalid document id." });

    const diff = await diffLatestVersions(docId);
    if (!diff) return res.status(404).json({ error: "No versions found for this document." });

    res.json({ diff });
  } catch (err) {
    console.error("GET /api/compliance/documents/:docId/diff failed:", err);
    res.status(500).json({ error: "Failed to compute diff." });
  }
});

export default router;
