/**
 * Publisher / Market Intelligence read endpoints.
 *
 * Completely separate from compliance routes and compliance runtime.
 * Mounted at /api/publishers.
 */

import { Router } from "express";
import { prisma } from "../db";
import { runPublisherSync } from "../publishers/ingestion/orchestrator";
import { getMarketContextPack } from "../publishers/context-pack";
import { getChannelPlan } from "../publishers/channel-plan";
import { requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";
import type {
  PublisherSourceClass,
  PublisherCoverageFocus,
  PublisherRelationshipType,
} from "@mexem/shared";

const router = Router();

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

function serializePublisher(row: any) {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    country: row.country,
    localeScope: safeParse<string[]>(row.localeScope, []),
    language: row.language,
    sourceClass: row.sourceClass,
    audienceType: row.audienceType,
    ingestionMode: row.ingestionMode,
    canonicalUrl: row.canonicalUrl,
    coverageFocus: safeParse<string[]>(row.coverageFocus, []),
    relationshipType: row.relationshipType,
    active: row.active,
    notes: row.notes,
    scoring: {
      authorityScore: row.authorityScore,
      audienceIntentScore: row.audienceIntentScore,
      brandSafetyScore: row.brandSafetyScore,
      partnerPriority: row.partnerPriority,
      marketRelevanceScore: row.marketRelevanceScore,
    },
    funnelRoles: safeParse<string[]>(row.funnelRolesJson, []),
    includeTags: safeParse<string[]>(row.includeTagsJson, []),
    includePaths: safeParse<string[]>(row.includePathsJson, []),
    excludeTags: safeParse<string[]>(row.excludeTagsJson, []),
    excludePaths: safeParse<string[]>(row.excludePathsJson, []),
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

// GET /api/publishers/sources
// Optional filters: country, sourceClass, audienceType, language, active
router.get("/sources", async (req, res) => {
  try {
    const country = qStr(req.query.country);
    const sourceClass = qStr(req.query.sourceClass);
    const audienceType = qStr(req.query.audienceType);
    const language = qStr(req.query.language);
    const active = typeof req.query.active === "string" ? req.query.active === "true" : undefined;

    const sources = await prisma.publisherSource.findMany({
      where: {
        ...(country ? { country } : {}),
        ...(sourceClass ? { sourceClass } : {}),
        ...(audienceType ? { audienceType } : {}),
        ...(language ? { language } : {}),
        ...(active !== undefined ? { active } : {}),
      },
      orderBy: [{ country: "asc" }, { code: "asc" }],
    });

    res.json({ sources: sources.map(serializePublisher) });
  } catch (err) {
    console.error("GET /api/publishers/sources failed:", err);
    res.status(500).json({ error: "Failed to list publisher sources." });
  }
});

// GET /api/publishers/sources/:codeOrId
router.get("/sources/:codeOrId", async (req, res) => {
  try {
    const key = req.params.codeOrId;
    const isNumeric = /^\d+$/.test(key);

    const source = await prisma.publisherSource.findFirst({
      where: isNumeric ? { id: Number(key) } : { code: key },
      include: { documents: { orderBy: { publishedAt: "desc" }, take: 20 } },
    });

    if (!source) return res.status(404).json({ error: "Publisher source not found." });

    res.json({
      source: serializePublisher(source),
      documents: (source as any).documents ?? [],
    });
  } catch (err) {
    console.error("GET /api/publishers/sources/:codeOrId failed:", err);
    res.status(500).json({ error: "Failed to load publisher source." });
  }
});

// GET /api/publishers/sources/by-country/:country
router.get("/sources/by-country/:country", async (req, res) => {
  try {
    const sources = await prisma.publisherSource.findMany({
      where: { country: req.params.country.toUpperCase(), active: true },
      orderBy: { code: "asc" },
    });

    res.json({ sources: sources.map(serializePublisher) });
  } catch (err) {
    console.error("GET /api/publishers/sources/by-country failed:", err);
    res.status(500).json({ error: "Failed to list publisher sources." });
  }
});

// GET /api/publishers/stats — summary counts by country and class
router.get("/stats", async (req, res) => {
  try {
    const sources = await prisma.publisherSource.findMany({
      where: { active: true },
      select: { country: true, sourceClass: true },
    });

    const byCountry: Record<string, number> = {};
    const byClass: Record<string, number> = {};
    for (const s of sources) {
      byCountry[s.country] = (byCountry[s.country] ?? 0) + 1;
      byClass[s.sourceClass] = (byClass[s.sourceClass] ?? 0) + 1;
    }

    res.json({ total: sources.length, byCountry, byClass });
  } catch (err) {
    console.error("GET /api/publishers/stats failed:", err);
    res.status(500).json({ error: "Failed to compute publisher stats." });
  }
});

// ─── Items (PublisherDocument) ───────────────────────────────────────

// GET /api/publishers/items
// Filters: sourceId, sourceCode, country, section
router.get("/items", async (req, res) => {
  try {
    const sourceId = qNum(req.query.sourceId);
    const sourceCode = qStr(req.query.sourceCode);
    const country = qStr(req.query.country);
    const section = qStr(req.query.section);

    const where: Record<string, unknown> = {};
    if (sourceId) where.sourceId = sourceId;
    if (sourceCode || country) {
      where.source = {
        ...(sourceCode ? { code: sourceCode.toUpperCase() } : {}),
        ...(country ? { country: country.toUpperCase() } : {}),
      };
    }
    if (section) where.section = section;

    const items = await prisma.publisherDocument.findMany({
      where,
      orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
      take: 100,
      include: { source: { select: { code: true, name: true, country: true } } },
    });

    res.json({
      items: items.map(i => ({
        ...i,
        tags: safeParse<string[]>(i.tagsJson, []),
        tagsJson: undefined,
      })),
    });
  } catch (err) {
    console.error("GET /api/publishers/items failed:", err);
    res.status(500).json({ error: "Failed to list publisher items." });
  }
});

// GET /api/publishers/items/:id
router.get("/items/:id", async (req, res) => {
  try {
    const id = Number(req.params.id);
    if (Number.isNaN(id)) return res.status(400).json({ error: "Invalid id." });

    const item = await prisma.publisherDocument.findUnique({
      where: { id },
      include: { source: { select: { code: true, name: true, country: true } } },
    });
    if (!item) return res.status(404).json({ error: "Item not found." });

    res.json({
      item: { ...item, tags: safeParse<string[]>(item.tagsJson, []), tagsJson: undefined },
    });
  } catch (err) {
    console.error("GET /api/publishers/items/:id failed:", err);
    res.status(500).json({ error: "Failed to load publisher item." });
  }
});

// ─── Sync ───────────────────────────────────────────────────────────

// POST /api/publishers/sync — trigger sync for one or all sources (admin only)
router.post("/sync", requireRole("MANAGER", "ADMIN"), async (req, res) => {
  try {
    const sourceCode = qStr(req.query.source);
    const country = qStr(req.query.country);

    let codes: string[];
    if (sourceCode) {
      codes = [sourceCode.toUpperCase()];
    } else {
      const where: Record<string, unknown> = { active: true };
      if (country) where.country = country.toUpperCase();
      const rows = await prisma.publisherSource.findMany({ where, select: { code: true }, orderBy: { code: "asc" } });
      codes = rows.map(r => r.code);
    }

    const results = [];
    for (const code of codes) {
      try {
        results.push(await runPublisherSync(code, "manual:api"));
      } catch (err: any) {
        results.push({ sourceCode: code, status: "failed", error: err.message });
      }
    }

    // Aggregate counts across the run's result set so the audit row answers
    // "who kicked off a sync, which sources, and what was the outcome" in
    // one read — without storing every fetched item.
    const summary = results.reduce(
      (acc, r: any) => {
        acc[r.status as string] = (acc[r.status as string] ?? 0) + 1;
        acc.itemsCreated += r.itemsCreated ?? 0;
        acc.itemsFetched += r.itemsFetched ?? 0;
        return acc;
      },
      { itemsCreated: 0, itemsFetched: 0 } as Record<string, number>
    );
    await writeAudit(req, {
      action: "publisher.sync",
      entityType: "PublisherSyncRun",
      metadata: {
        requestedSourceCode: sourceCode ?? null,
        requestedCountry: country ?? null,
        sourcesAttempted: codes.length,
        statusCounts: summary,
        sources: results.map((r: any) => ({ code: r.sourceCode, status: r.status })),
      },
    });

    res.json({ results });
  } catch (err: any) {
    console.error("POST /api/publishers/sync failed:", err);
    res.status(500).json({ error: err?.message ?? "Publisher sync failed." });
  }
});

// GET /api/publishers/sync-runs
router.get("/sync-runs", async (req, res) => {
  try {
    const sourceCode = qStr(req.query.sourceCode);
    const where = sourceCode ? { source: { code: sourceCode.toUpperCase() } } : {};

    const runs = await prisma.publisherSyncRun.findMany({
      where,
      orderBy: { startedAt: "desc" },
      take: 50,
      include: { source: { select: { code: true, name: true } } },
    });

    res.json({ runs });
  } catch (err) {
    console.error("GET /api/publishers/sync-runs failed:", err);
    res.status(500).json({ error: "Failed to list sync runs." });
  }
});

// ─── Ranked & funnel-filtered queries ───────────────────────────────

// GET /api/publishers/ranked — top sources by composite score
// Filters: country, audienceType, funnelRole, sortBy (authority|intent|partner|relevance|composite)
router.get("/ranked", async (req, res) => {
  try {
    const country = qStr(req.query.country);
    const audienceType = qStr(req.query.audienceType);
    const funnelRole = qStr(req.query.funnelRole);
    const sortBy = qStr(req.query.sortBy) ?? "composite";
    const limit = Math.min(Number(req.query.limit) || 10, 50);

    const where: Record<string, unknown> = { active: true };
    if (country) where.country = country.toUpperCase();
    if (audienceType) where.audienceType = audienceType;

    let sources = await prisma.publisherSource.findMany({ where, orderBy: { code: "asc" } });

    // Filter by funnel role
    if (funnelRole) {
      sources = sources.filter(s => {
        const roles = safeParse<string[]>(s.funnelRolesJson, []);
        return roles.includes(funnelRole);
      });
    }

    // Sort
    const sortFn: Record<string, (a: any, b: any) => number> = {
      authority: (a, b) => b.authorityScore - a.authorityScore,
      intent: (a, b) => b.audienceIntentScore - a.audienceIntentScore,
      partner: (a, b) => b.partnerPriority - a.partnerPriority,
      relevance: (a, b) => b.marketRelevanceScore - a.marketRelevanceScore,
      safety: (a, b) => b.brandSafetyScore - a.brandSafetyScore,
      composite: (a, b) => {
        const sc = (r: any) => r.authorityScore * 0.15 + r.audienceIntentScore * 0.30 + r.brandSafetyScore * 0.10 + r.partnerPriority * 0.20 + r.marketRelevanceScore * 0.25;
        return sc(b) - sc(a);
      },
    };
    sources.sort(sortFn[sortBy] ?? sortFn.composite);

    res.json({
      sources: sources.slice(0, limit).map(s => ({
        ...serializePublisher(s),
        compositeScore: Math.round(
          s.authorityScore * 0.15 + s.audienceIntentScore * 0.30 +
          s.brandSafetyScore * 0.10 + s.partnerPriority * 0.20 +
          s.marketRelevanceScore * 0.25
        ),
      })),
      total: sources.length,
      sortedBy: sortBy,
    });
  } catch (err) {
    console.error("GET /api/publishers/ranked failed:", err);
    res.status(500).json({ error: "Failed to rank publisher sources." });
  }
});

// GET /api/publishers/funnel/:role — sources for a specific funnel role
router.get("/funnel/:role", async (req, res) => {
  try {
    const role = req.params.role;
    const country = qStr(req.query.country);

    const where: Record<string, unknown> = { active: true };
    if (country) where.country = country.toUpperCase();

    let sources = await prisma.publisherSource.findMany({ where, orderBy: { code: "asc" } });
    sources = sources.filter(s => safeParse<string[]>(s.funnelRolesJson, []).includes(role));
    sources.sort((a, b) => (b.marketRelevanceScore ?? 50) - (a.marketRelevanceScore ?? 50));

    res.json({
      funnelRole: role,
      country: country ?? "all",
      sources: sources.map(serializePublisher),
      total: sources.length,
    });
  } catch (err) {
    console.error("GET /api/publishers/funnel/:role failed:", err);
    res.status(500).json({ error: "Failed to list funnel sources." });
  }
});

// ─── Market Context Pack ────────────────────────────────────────────

// GET /api/publishers/context-pack?locale=it-IT&audienceType=retail
router.get("/context-pack", async (req, res) => {
  try {
    const locale = qStr(req.query.locale);
    if (!locale) return res.status(400).json({ error: "locale query parameter is required." });

    const pack = await getMarketContextPack({
      locale,
      audienceType: qStr(req.query.audienceType) as any,
      textType: qStr(req.query.textType),
      sourceClassPreference: qStrArray(req.query.sourceClass) as PublisherSourceClass[] | undefined,
      coverageFocusPreference: qStrArray(req.query.coverageFocus) as PublisherCoverageFocus[] | undefined,
    });

    res.json({ pack });
  } catch (err: any) {
    console.error("GET /api/publishers/context-pack failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed to build market context pack." });
  }
});

// GET /api/publishers/context-pack/compare?locales=it-IT,es-ES,nl-NL,fr-FR
router.get("/context-pack/compare", async (req, res) => {
  try {
    const localesParam = qStr(req.query.locales);
    if (!localesParam) return res.status(400).json({ error: "locales query parameter is required (comma-separated)." });
    const locales = localesParam.split(",").map(l => l.trim()).filter(Boolean);
    if (locales.length === 0 || locales.length > 10) return res.status(400).json({ error: "Provide 1-10 comma-separated locales." });

    const audienceType = qStr(req.query.audienceType) as any;
    const packs = await Promise.all(locales.map(locale => getMarketContextPack({ locale, audienceType })));

    res.json({
      packs: packs.map(p => ({
        locale: p.locale,
        country: p.country,
        language: p.language,
        audienceProfile: p.audienceProfile,
        sourceCount: p.topSources.length + p.partnerSources.length + p.officialMarketSources.length + p.communitySources.length,
        topSourceCodes: p.topSources.map(s => s.code),
        editorialThemes: p.editorialThemes,
        channelHints: p.channelHints,
        preferredFraming: p.preferredFraming,
      })),
    });
  } catch (err: any) {
    console.error("GET /api/publishers/context-pack/compare failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed to compare context packs." });
  }
});

// ─── Channel Plan ───────────────────────────────────────────────────

// GET /api/publishers/channel-plan?locale=it-IT&campaignGoal=awareness&audienceType=retail
router.get("/channel-plan", async (req, res) => {
  try {
    const locale = qStr(req.query.locale);
    const campaignGoal = qStr(req.query.campaignGoal);
    if (!locale || !campaignGoal) {
      return res.status(400).json({ error: "locale and campaignGoal are required." });
    }

    const plan = await getChannelPlan({
      locale,
      campaignGoal: campaignGoal as any,
      audienceType: qStr(req.query.audienceType) as any,
      sourceClassPreference: qStrArray(req.query.sourceClass) as PublisherSourceClass[] | undefined,
      relationshipPreference: qStrArray(req.query.relationship) as PublisherRelationshipType[] | undefined,
      maxResults: req.query.maxResults ? Number(req.query.maxResults) : undefined,
    });

    res.json({ plan });
  } catch (err: any) {
    console.error("GET /api/publishers/channel-plan failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed to build channel plan." });
  }
});

// GET /api/publishers/channel-plan/compare?locale=it-IT&goals=awareness,research,partner_alignment
router.get("/channel-plan/compare", async (req, res) => {
  try {
    const locale = qStr(req.query.locale);
    const goalsParam = qStr(req.query.goals);
    if (!locale || !goalsParam) {
      return res.status(400).json({ error: "locale and goals (comma-separated) are required." });
    }
    const goals = goalsParam.split(",").map(g => g.trim()).filter(Boolean);
    const audienceType = qStr(req.query.audienceType) as any;

    const plans = await Promise.all(goals.map(goal =>
      getChannelPlan({ locale, campaignGoal: goal as any, audienceType })
    ));

    res.json({
      locale,
      comparisons: plans.map(p => ({
        campaignGoal: p.campaignGoal,
        topCodes: p.recommended.slice(0, 5).map(r => r.code),
        topWithScores: p.recommended.slice(0, 5).map(r => ({
          code: r.code, goalScore: r.goalScore, reason: r.selectionReason,
        })),
        excludedCount: p.excluded.length,
        summary: p.summary,
      })),
    });
  } catch (err: any) {
    console.error("GET /api/publishers/channel-plan/compare failed:", err);
    res.status(500).json({ error: err?.message ?? "Failed to compare channel plans." });
  }
});

function qStr(v: unknown): string | undefined {
  return typeof v === "string" && v !== "" ? v : undefined;
}

function qNum(v: unknown): number | undefined {
  if (typeof v === "string" && /^\d+$/.test(v)) return Number(v);
  return undefined;
}

function qStrArray(v: unknown): string[] | undefined {
  if (typeof v === "string" && v !== "") return v.split(",").map(s => s.trim()).filter(Boolean);
  return undefined;
}

export default router;
