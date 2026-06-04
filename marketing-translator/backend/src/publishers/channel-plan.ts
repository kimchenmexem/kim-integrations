/**
 * Channel Plan service.
 *
 * Recommends publisher sources for a given locale, audience, and campaign goal.
 * Heuristic and transparent — every recommendation includes a reason.
 *
 * NOT a compliance service. Advisory/internal planning only.
 * NON-CRYPTO. Crypto sources are excluded by design (all sources have excludeTags).
 */

import { prisma } from "../db";
import type {
  ChannelPlan,
  ChannelPlanRequest,
  ChannelRecommendation,
  CampaignGoal,
  PublisherFunnelRole,
  PublisherCoverageFocus,
  PublisherScoring,
} from "@mexem/shared";

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

const LOCALE_COUNTRY: Record<string, string> = {
  "it-IT": "IT", "fr-FR": "FR", "nl-NL": "NL", "nl-BE": "BE",
  "fr-BE": "BE", "es-ES": "ES", "en-GB": "GB",
};

/**
 * Goal → which funnel roles are most relevant, which scores matter most,
 * and which coverage topics are preferred.
 */
const GOAL_CONFIG: Record<CampaignGoal, {
  funnelMatch: PublisherFunnelRole[];
  scoreWeights: { authority: number; intent: number; partner: number; relevance: number; safety: number };
  preferredCoverage: PublisherCoverageFocus[];
  description: string;
}> = {
  awareness: {
    funnelMatch: ["awareness"],
    scoreWeights: { authority: 0.35, intent: 0.10, partner: 0.10, relevance: 0.25, safety: 0.20 },
    preferredCoverage: ["macro", "equities", "listed_companies"],
    description: "Maximise brand visibility in high-authority, brand-safe channels.",
  },
  education: {
    funnelMatch: ["awareness", "research"],
    scoreWeights: { authority: 0.20, intent: 0.25, partner: 0.15, relevance: 0.25, safety: 0.15 },
    preferredCoverage: ["education", "funds", "ETFs"],
    description: "Reach audiences seeking financial education and product understanding.",
  },
  research: {
    funnelMatch: ["research", "high_intent"],
    scoreWeights: { authority: 0.15, intent: 0.30, partner: 0.20, relevance: 0.25, safety: 0.10 },
    preferredCoverage: ["equities", "ETFs", "funds", "broker_reviews"],
    description: "Engage users actively comparing platforms and products.",
  },
  active_trader_engagement: {
    funnelMatch: ["high_intent", "community"],
    scoreWeights: { authority: 0.10, intent: 0.35, partner: 0.25, relevance: 0.25, safety: 0.05 },
    preferredCoverage: ["equities", "ETFs", "community", "broker_reviews"],
    description: "Engage experienced traders in communities and high-intent channels.",
  },
  partner_alignment: {
    funnelMatch: ["research", "high_intent", "community"],
    scoreWeights: { authority: 0.10, intent: 0.15, partner: 0.45, relevance: 0.20, safety: 0.10 },
    preferredCoverage: ["broker_reviews", "equities", "ETFs", "funds"],
    description: "Prioritise sources with high partnership/placement potential.",
  },
};

function goalScore(row: any, goal: CampaignGoal, funnelRoles: string[], coverageFocus: string[]): number {
  const cfg = GOAL_CONFIG[goal];
  const w = cfg.scoreWeights;

  let score =
    (row.authorityScore ?? 50) * w.authority +
    (row.audienceIntentScore ?? 50) * w.intent +
    (row.partnerPriority ?? 50) * w.partner +
    (row.marketRelevanceScore ?? 50) * w.relevance +
    (row.brandSafetyScore ?? 70) * w.safety;

  // Bonus for funnel match
  const funnelOverlap = cfg.funnelMatch.filter(f => funnelRoles.includes(f)).length;
  score += funnelOverlap * 8;

  // Bonus for coverage match
  const coverageOverlap = cfg.preferredCoverage.filter(c => coverageFocus.includes(c)).length;
  score += coverageOverlap * 3;

  return Math.round(score);
}

function buildReason(row: any, goal: CampaignGoal, funnelRoles: string[], coverageFocus: string[]): string {
  const cfg = GOAL_CONFIG[goal];
  const parts: string[] = [];

  const funnelOverlap = cfg.funnelMatch.filter(f => funnelRoles.includes(f));
  if (funnelOverlap.length > 0) parts.push(`funnel fit: ${funnelOverlap.join(", ")}`);

  const coverageOverlap = cfg.preferredCoverage.filter(c => coverageFocus.includes(c));
  if (coverageOverlap.length > 0) parts.push(`covers: ${coverageOverlap.join(", ")}`);

  // Highlight dominant scores
  if (goal === "awareness" && row.authorityScore >= 80) parts.push(`high authority (${row.authorityScore})`);
  if (goal === "partner_alignment" && row.partnerPriority >= 70) parts.push(`high partner priority (${row.partnerPriority})`);
  if ((goal === "research" || goal === "active_trader_engagement") && row.audienceIntentScore >= 75) parts.push(`strong audience intent (${row.audienceIntentScore})`);
  if (row.relationshipType === "target_publisher") parts.push("target publisher");
  if (row.relationshipType === "partner") parts.push("existing partner");

  return parts.length > 0 ? parts.join("; ") : "general market relevance";
}

function buildExclusionReason(row: any, goal: CampaignGoal, audience: string, funnelRoles: string[]): string | null {
  const cfg = GOAL_CONFIG[goal];
  const funnelOverlap = cfg.funnelMatch.filter(f => funnelRoles.includes(f));

  if (funnelOverlap.length === 0 && funnelRoles.length > 0) {
    return `funnel mismatch: source is ${funnelRoles.join("/")} but goal needs ${cfg.funnelMatch.join("/")}`;
  }
  if (row.brandSafetyScore < 50) return `low brand safety (${row.brandSafetyScore})`;
  return null;
}

export async function getChannelPlan(req: ChannelPlanRequest): Promise<ChannelPlan> {
  const country = LOCALE_COUNTRY[req.locale] ?? "EU";
  const audience = req.audienceType ?? "retail";
  const goal = req.campaignGoal;
  const maxResults = Math.min(req.maxResults ?? 10, 20);
  const cfg = GOAL_CONFIG[goal];

  const allSources = await prisma.publisherSource.findMany({
    where: { country, active: true },
    orderBy: { code: "asc" },
  });

  // Parse + score
  const scored = allSources.map(row => {
    const funnelRoles = safeParse<string[]>(row.funnelRolesJson, []);
    const coverageFocus = safeParse<string[]>(row.coverageFocus, []);
    return {
      row,
      funnelRoles,
      coverageFocus,
      score: goalScore(row, goal, funnelRoles, coverageFocus),
      reason: buildReason(row, goal, funnelRoles, coverageFocus),
      exclusionReason: buildExclusionReason(row, goal, audience, funnelRoles),
    };
  });

  // Apply optional preference filters
  let candidates = scored;
  if (req.sourceClassPreference?.length) {
    const pref = new Set(req.sourceClassPreference);
    const match = candidates.filter(c => pref.has(c.row.sourceClass as any));
    if (match.length > 0) candidates = match;
  }
  if (req.relationshipPreference?.length) {
    const pref = new Set(req.relationshipPreference);
    const match = candidates.filter(c => pref.has(c.row.relationshipType as any));
    if (match.length > 0) candidates = match;
  }

  // Sort by goal score descending
  candidates.sort((a, b) => b.score - a.score);

  // Split into recommended and excluded
  const recommended: ChannelRecommendation[] = candidates
    .slice(0, maxResults)
    .map(c => ({
      code: c.row.code,
      name: c.row.name,
      canonicalUrl: c.row.canonicalUrl,
      sourceClass: c.row.sourceClass as any,
      audienceType: c.row.audienceType as any,
      relationshipType: c.row.relationshipType as any,
      scoring: {
        authorityScore: c.row.authorityScore,
        audienceIntentScore: c.row.audienceIntentScore,
        brandSafetyScore: c.row.brandSafetyScore,
        partnerPriority: c.row.partnerPriority,
        marketRelevanceScore: c.row.marketRelevanceScore,
      },
      funnelRoles: c.funnelRoles as any[],
      coverageFocus: c.coverageFocus as any[],
      selectionReason: c.reason,
      goalScore: c.score,
    }));

  const excluded = scored
    .filter(c => !recommended.some(r => r.code === c.row.code) && c.exclusionReason)
    .map(c => ({ code: c.row.code, name: c.row.name, reason: c.exclusionReason! }));

  return {
    locale: req.locale,
    country,
    campaignGoal: goal,
    audienceType: audience,
    recommended,
    excluded,
    summary: `${cfg.description} ${recommended.length} sources recommended for ${country} (${goal}, ${audience}). ${excluded.length} excluded.`,
    provenance: `Derived from ${allSources.length} active sources in ${country}. Generated ${new Date().toISOString()}.`,
  };
}
