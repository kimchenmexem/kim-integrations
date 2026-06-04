/**
 * Publisher / Market Intelligence layer types.
 *
 * Completely separate from the compliance source-of-truth.
 * NOT used for regulatory compliance, rule bundles, or legal obligations.
 * NON-CRYPTO scope. Adapters must filter out crypto/virtual-asset content.
 */

import type { LocaleCode } from "./index";

export type PublisherCountry = "IT" | "ES" | "NL" | "FR" | "BE" | "GB" | "EU";

export type PublisherSourceClass =
  | "publisher"
  | "exchange"
  | "community"
  | "business_media"
  | "official_market";

export type PublisherAudienceType =
  | "retail"
  | "active_trader"
  | "professional"
  | "mass_market";

export type PublisherIngestionMode =
  | "curated"
  | "rss"
  | "html_list"
  | "manual";

export type PublisherCoverageFocus =
  | "equities"
  | "ETFs"
  | "bonds"
  | "funds"
  | "macro"
  | "listed_companies"
  | "broker_reviews"
  | "education"
  | "community";

export type PublisherRelationshipType =
  | "owned"
  | "partner"
  | "target_publisher"
  | "reference_source";

export type PublisherFunnelRole =
  | "awareness"
  | "research"
  | "high_intent"
  | "community"
  | "official_market";

export interface PublisherScoring {
  authorityScore: number;       // 0-100: editorial credibility
  audienceIntentScore: number;  // 0-100: audience match to MEXEM target
  brandSafetyScore: number;     // 0-100: risk of association
  partnerPriority: number;      // 0-100: strategic partnership value
  marketRelevanceScore: number; // 0-100: relevance to MEXEM products
}

export interface PublisherSource {
  id: number;
  code: string;
  name: string;
  country: PublisherCountry;
  localeScope: LocaleCode[];
  language: string;
  sourceClass: PublisherSourceClass;
  audienceType: PublisherAudienceType;
  ingestionMode: PublisherIngestionMode;
  canonicalUrl: string;
  coverageFocus: PublisherCoverageFocus[];
  relationshipType: PublisherRelationshipType;
  active: boolean;
  notes?: string | null;
  scoring: PublisherScoring;
  funnelRoles: PublisherFunnelRole[];
  includeTags?: string[];
  includePaths?: string[];
  excludeTags?: string[];
  excludePaths?: string[];
  createdAt: string;
  updatedAt: string;
}

export interface PublisherDocument {
  id: number;
  sourceId: number;
  externalRef: string;
  title: string;
  url?: string | null;
  publishedAt?: string | null;
  language?: string | null;
  section?: string | null;
  tags?: string[];
  summary?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface PublisherSyncRun {
  id: number;
  sourceId?: number | null;
  startedAt: string;
  finishedAt?: string | null;
  status: string;
  triggeredBy: string;
  itemsFetched: number;
  itemsCreated: number;
  itemsFiltered: number;
  errorMessage?: string | null;
}

// ─── Market Context Pack ────────────────────────────────────────────
// Advisory/contextual output for content generation and media planning.
// NOT used for compliance decisions.

export interface MarketContextPackRequest {
  locale: string;
  audienceType?: PublisherAudienceType;
  textType?: string;
  relationshipPreference?: PublisherRelationshipType[];
  sourceClassPreference?: PublisherSourceClass[];
  coverageFocusPreference?: PublisherCoverageFocus[];
}

export interface MarketContextSourceRef {
  code: string;
  name: string;
  sourceClass: PublisherSourceClass;
  audienceType: PublisherAudienceType;
  relationshipType: PublisherRelationshipType;
  canonicalUrl: string;
  coverageFocus: PublisherCoverageFocus[];
  scoring: PublisherScoring;
  funnelRoles: PublisherFunnelRole[];
  notes?: string | null;
}

export interface MarketContextPack {
  locale: string;
  country: string;
  language: string;
  audienceProfile: string;
  topSources: MarketContextSourceRef[];
  partnerSources: MarketContextSourceRef[];
  officialMarketSources: MarketContextSourceRef[];
  communitySources: MarketContextSourceRef[];
  editorialThemes: string[];
  channelHints: string[];
  preferredFraming: string[];
  excludedThemes: string[];
  recentItems: Array<{ source: string; title: string; url?: string; section?: string }>;
  notes: string;
  provenance: string;
}

// ─── Channel Plan ───────────────────────────────────────────────────
// Internal media/channel planning output. Advisory only.

export type CampaignGoal =
  | "awareness"
  | "education"
  | "research"
  | "active_trader_engagement"
  | "partner_alignment";

export interface ChannelPlanRequest {
  locale: string;
  audienceType?: PublisherAudienceType;
  campaignGoal: CampaignGoal;
  relationshipPreference?: PublisherRelationshipType[];
  sourceClassPreference?: PublisherSourceClass[];
  maxResults?: number;
}

export interface ChannelRecommendation {
  code: string;
  name: string;
  canonicalUrl: string;
  sourceClass: PublisherSourceClass;
  audienceType: PublisherAudienceType;
  relationshipType: PublisherRelationshipType;
  scoring: PublisherScoring;
  funnelRoles: PublisherFunnelRole[];
  coverageFocus: PublisherCoverageFocus[];
  /** Why this source was selected for the given goal. */
  selectionReason: string;
  /** Relevance score for this specific goal (0–100). */
  goalScore: number;
}

export interface ChannelPlan {
  locale: string;
  country: string;
  campaignGoal: CampaignGoal;
  audienceType: string;
  recommended: ChannelRecommendation[];
  excluded: Array<{ code: string; name: string; reason: string }>;
  summary: string;
  provenance: string;
}

/** Seed-time shape for the publisher registry. */
export interface PublisherSourceSeed {
  code: string;
  name: string;
  country: PublisherCountry;
  localeScope: LocaleCode[];
  language: string;
  sourceClass: PublisherSourceClass;
  audienceType: PublisherAudienceType;
  ingestionMode: PublisherIngestionMode;
  canonicalUrl: string;
  coverageFocus: PublisherCoverageFocus[];
  relationshipType: PublisherRelationshipType;
  active: boolean;
  notes?: string;
  scoring?: Partial<PublisherScoring>;
  funnelRoles?: PublisherFunnelRole[];
  includeTags?: string[];
  includePaths?: string[];
  excludeTags?: string[];
  excludePaths?: string[];
}
