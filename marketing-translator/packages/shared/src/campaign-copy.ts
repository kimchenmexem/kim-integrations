import type { LocaleCode } from "./index";

export type LocaleDirection = "ltr" | "rtl";

export interface CampaignCopyConceptHint {
  conceptId?: string;
  name?: string;
  strategicIdea?: string;
}

export interface CampaignCopyRequest {
  brief: {
    marketingMessage: string;
    campaignGoal: "awareness" | "consideration" | "conversion" | "retention";
    targetAudience?: string;
    notes?: string;
  };
  targetLocale: LocaleCode;
  tone: string | string[];
  complianceNotes?: string;
  conceptHint?: CampaignCopyConceptHint;
  riskWarningRequired?: boolean;
}

export interface CampaignCopyResponse {
  locale: LocaleCode;
  direction: LocaleDirection;
  headline: string;
  subheadline: string;
  body?: string;
  cta: string;
  disclaimer: string;
  complianceNotes: string[];
}

// Enriched concept context — extends the single-call hint with the visual
// / emotional / mood signals the LLM strategy pass produces. All fields are
// optional so legacy callers keep working.
export interface CampaignCopyBatchConcept {
  conceptId: string;
  name?: string;
  strategicIdea?: string;
  targetEmotion?: string;
  tone?: string | string[];
  composition?: string;
  moodKeywords?: string[];
}

// Batch request: a single brief + locale + tone, with N concepts. The
// backend prompts the model with all N at once so each concept can be
// distinct from its siblings (no repeated CTAs / headlines across concepts).
export interface CampaignCopyBatchRequest {
  brief: {
    marketingMessage: string;
    campaignGoal: "awareness" | "consideration" | "conversion" | "retention";
    targetAudience?: string;
    notes?: string;
  };
  targetLocale: LocaleCode;
  tone: string | string[];
  complianceNotes?: string;
  riskWarningRequired?: boolean;
  concepts: CampaignCopyBatchConcept[];
}

export interface CampaignCopyBatchConceptResult {
  conceptId: string;
  headline: string;
  subheadline: string;
  body?: string;
  cta: string;
  disclaimer: string;
  complianceNotes: string[];
  // Optional typographic accents that the renderer drops into the manifest
  // when present. Generating them server-side guarantees they pass the
  // same compliance pipeline as the main copy fields.
  //   eyebrow — short ALL-CAPS category label above the headline.
  //   kicker  — short supporting pull-quote line below the subheadline.
  // `stat` is intentionally NOT produced by the LLM (specific numbers are
  // regulatory claims and must come from a verified source, not an AI).
  eyebrow?: string;
  kicker?: string;
}

export interface CampaignCopyBatchResponse {
  locale: LocaleCode;
  direction: LocaleDirection;
  concepts: CampaignCopyBatchConceptResult[];
}

// "By-message" request: one marketing message → N concept variants, each
// banner field generated separately with its platform-appropriate textType
// length / convention. The strategy LLM is bypassed entirely for copy;
// it still runs upstream for visual direction (composition, palette, etc).
export interface CampaignCopyByMessageRequest {
  brief: {
    marketingMessage: string;
    campaignGoal: "awareness" | "consideration" | "conversion" | "retention";
    targetAudience?: string;
    notes?: string;
  };
  targetLocale: LocaleCode;
  persona: string;
  tone: string | string[];
  complianceNotes?: string;
  riskWarningRequired?: boolean;
  // Number of concept variants to produce per field. Each i-th variant
  // across fields zips into the i-th concept. Default 3.
  conceptCount?: number;
}

// Response shape mirrors CampaignCopyBatchResponse so banner-side code can
// consume either endpoint with the same parser.
export type CampaignCopyByMessageResponse = CampaignCopyBatchResponse;
