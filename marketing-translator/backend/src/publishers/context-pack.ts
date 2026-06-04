/**
 * Market Context Pack service.
 *
 * Compiles publisher/market-intelligence metadata into a structured,
 * safe input for content generation, campaign planning, and internal use.
 *
 * NOT a compliance service. Output is advisory/contextual only.
 * NON-CRYPTO: crypto themes are always excluded.
 */

import { prisma } from "../db";
import type {
  MarketContextPack,
  MarketContextPackRequest,
  MarketContextSourceRef,
  PublisherAudienceType,
  PublisherSourceClass,
  PublisherCoverageFocus,
} from "@mexem/shared";

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/** Map locale to country code. */
const LOCALE_COUNTRY: Record<string, string> = {
  "it-IT": "IT", "fr-FR": "FR", "nl-NL": "NL", "nl-BE": "BE",
  "fr-BE": "BE", "es-ES": "ES", "en-GB": "GB",
};

const LOCALE_LANGUAGE: Record<string, string> = {
  "it-IT": "it", "fr-FR": "fr", "nl-NL": "nl", "nl-BE": "nl",
  "fr-BE": "fr", "es-ES": "es", "en-GB": "en",
};

/** Audience descriptions for the pack. */
const AUDIENCE_PROFILES: Record<PublisherAudienceType, string> = {
  retail: "Retail investors — new to moderate experience, personal finance focus, price-sensitive, seeking accessible language and clear product explanations.",
  active_trader: "Active traders — frequent trading, comfortable with technical terms, interested in execution quality, commissions, and market analysis.",
  professional: "Professional/institutional audience — expects precise, formal language, regulatory awareness, and data-driven content.",
  mass_market: "Mass-market audience — general public with casual interest in finance, needs simple and reassuring messaging.",
};

/** Framing guidance per audience. */
const FRAMING: Record<PublisherAudienceType, string[]> = {
  retail: [
    "Use clear, accessible language — avoid jargon",
    "Lead with benefits and transparency (e.g. pricing, ease of use)",
    "Highlight platform trustworthiness and regulation",
    "Use educational framing — 'learn', 'explore', 'discover'",
  ],
  active_trader: [
    "Use technical vocabulary naturally (commissions, execution, ETPs)",
    "Be direct and action-oriented",
    "Emphasise tools, speed, and market access",
    "Skip basic explanations — audience knows the fundamentals",
  ],
  professional: [
    "Use formal, precise language",
    "Lead with data, platform capabilities, and regulatory standing",
    "Avoid promotional superlatives — factual tone",
    "Reference specific instruments and market infrastructure",
  ],
  mass_market: [
    "Keep it simple and reassuring",
    "Avoid financial jargon entirely",
    "Focus on trust, safety, and ease of getting started",
    "Use everyday language and relatable framing",
  ],
};

/** Channel hints per source class mix. */
function deriveChannelHints(sources: Array<{ sourceClass: string }>): string[] {
  const classes = new Set(sources.map(s => s.sourceClass));
  const hints: string[] = [];
  if (classes.has("business_media")) hints.push("Sponsored content or advertorials in business media");
  if (classes.has("publisher")) hints.push("Display / native ads on financial publisher sites");
  if (classes.has("community")) hints.push("Community engagement — forum sponsorship, expert Q&A");
  if (classes.has("exchange")) hints.push("Co-marketing with exchange-listed products");
  if (classes.has("official_market")) hints.push("Institutional visibility via official market channels");
  return hints;
}

/** Derive editorial themes from coverage focus across all sources. */
function deriveEditorialThemes(sources: Array<{ coverageFocus: string[] }>): string[] {
  const counts: Record<string, number> = {};
  for (const s of sources) {
    for (const f of s.coverageFocus) counts[f] = (counts[f] ?? 0) + 1;
  }
  return Object.entries(counts)
    .sort((a, b) => b[1] - a[1])
    .map(([theme]) => theme);
}

function toSourceRef(row: any): MarketContextSourceRef {
  return {
    code: row.code,
    name: row.name,
    sourceClass: row.sourceClass,
    audienceType: row.audienceType,
    relationshipType: row.relationshipType,
    canonicalUrl: row.canonicalUrl,
    coverageFocus: safeParse<PublisherCoverageFocus[]>(row.coverageFocus, []),
    scoring: {
      authorityScore: row.authorityScore ?? 50,
      audienceIntentScore: row.audienceIntentScore ?? 50,
      brandSafetyScore: row.brandSafetyScore ?? 70,
      partnerPriority: row.partnerPriority ?? 50,
      marketRelevanceScore: row.marketRelevanceScore ?? 50,
    },
    funnelRoles: safeParse(row.funnelRolesJson, []),
    notes: row.notes,
  };
}

/** Composite score for ranking — weighted blend of scores. */
function compositeScore(row: any, audience: string): number {
  const audienceMatch = row.audienceType === audience ? 20 : 0;
  return (
    (row.authorityScore ?? 50) * 0.15 +
    (row.audienceIntentScore ?? 50) * 0.30 +
    (row.brandSafetyScore ?? 70) * 0.10 +
    (row.partnerPriority ?? 50) * 0.20 +
    (row.marketRelevanceScore ?? 50) * 0.25 +
    audienceMatch
  );
}

export async function getMarketContextPack(req: MarketContextPackRequest): Promise<MarketContextPack> {
  const country = LOCALE_COUNTRY[req.locale] ?? "EU";
  const language = LOCALE_LANGUAGE[req.locale] ?? "en";
  const audience = req.audienceType ?? "retail";

  // Query all active sources for this country
  const allSources = await prisma.publisherSource.findMany({
    where: { country, active: true },
    orderBy: { code: "asc" },
  });

  // Parse JSON fields
  const parsed = allSources.map(s => ({
    ...s,
    coverageFocus: safeParse<string[]>(s.coverageFocus, []),
  }));

  // Apply optional preference filters (narrow, don't exclude — fallback to all if empty)
  let filtered = parsed;
  if (req.sourceClassPreference?.length) {
    const pref = new Set(req.sourceClassPreference);
    const match = parsed.filter(s => pref.has(s.sourceClass as PublisherSourceClass));
    if (match.length > 0) filtered = match;
  }
  if (req.coverageFocusPreference?.length) {
    const pref = new Set(req.coverageFocusPreference);
    const match = filtered.filter(s => s.coverageFocus.some(f => pref.has(f as PublisherCoverageFocus)));
    if (match.length > 0) filtered = match;
  }

  // Rank by composite score (audience-weighted)
  const ranked = [...filtered].sort((a, b) => compositeScore(b, audience) - compositeScore(a, audience));

  // Categorise — top sources are the highest-scored, up to 5
  const topSources = ranked.slice(0, 5).map(toSourceRef);

  const partnerSources = parsed
    .filter(s => s.relationshipType === "partner" || s.relationshipType === "target_publisher")
    .sort((a, b) => (b.partnerPriority ?? 50) - (a.partnerPriority ?? 50))
    .map(toSourceRef);

  const officialMarketSources = parsed
    .filter(s => s.sourceClass === "exchange" || s.sourceClass === "official_market")
    .map(toSourceRef);

  const communitySources = parsed
    .filter(s => s.sourceClass === "community")
    .map(toSourceRef);

  // Recent items (if any exist)
  const recentItems = await prisma.publisherDocument.findMany({
    where: { source: { country, active: true } },
    orderBy: { createdAt: "desc" },
    take: 5,
    include: { source: { select: { code: true } } },
  });

  const editorialThemes = deriveEditorialThemes(parsed);
  const channelHints = deriveChannelHints(parsed);

  return {
    locale: req.locale,
    country,
    language,
    audienceProfile: AUDIENCE_PROFILES[audience] ?? AUDIENCE_PROFILES.retail,
    topSources,
    partnerSources,
    officialMarketSources,
    communitySources,
    editorialThemes,
    channelHints,
    preferredFraming: FRAMING[audience] ?? FRAMING.retail,
    excludedThemes: [
      "crypto", "cryptocurrency", "bitcoin", "ethereum", "NFT",
      "DeFi", "stablecoin", "blockchain", "web3", "virtual-assets",
    ],
    recentItems: recentItems.map(i => ({
      source: (i as any).source.code,
      title: i.title,
      url: i.url ?? undefined,
      section: i.section ?? undefined,
    })),
    notes: `Market context for ${req.locale} (${country}). ${parsed.length} active publisher sources. Advisory only — not for compliance decisions.`,
    provenance: `Derived from PublisherSource registry. ${parsed.length} sources, ${recentItems.length} recent items. Generated ${new Date().toISOString()}.`,
  };
}
