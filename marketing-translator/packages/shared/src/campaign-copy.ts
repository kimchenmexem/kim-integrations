import type { LocaleCode } from "./index";

export type LocaleDirection = "ltr" | "rtl";

// ── Compliance decision metadata ─────────────────────────────────────────────
//
// Mirrors the backend decision layer (services/decision-layer.ts). Surfaced on
// every campaign-copy response so the banner tool can see *why* a field was
// approved / rewritten, and — on a fail-closed 422 — exactly which fields
// blocked generation.

export type ComplianceDecisionStatus =
  | "SAFE"
  | "NON_COMPLIANT"
  | "BORDERLINE"
  | "UNCERTAIN";

export type ComplianceFinalAction =
  | "auto_approved"
  | "rewritten"
  | "escalated_to_human_review"
  | "blocked";

export interface FieldComplianceMeta {
  /** Field name: "headline" | "subheadline" | "body" | "cta" | "disclaimer" | "eyebrow" | "kicker". */
  field: string;
  /** Present on batch / by-message responses so a blocked field is traceable to its concept. */
  conceptId?: string;
  status: ComplianceDecisionStatus;
  finalAction: ComplianceFinalAction;
  /** Fused confidence 0-100. */
  confidence: number;
  /** True when the shipped text differs from the model draft because the decision layer rewrote it. */
  rewritten: boolean;
  /** False when the field is blocked or escalated to human review — i.e. NOT safe to ship. */
  shippable: boolean;
  /** Human-readable issue strings from the fused decision (may be empty). */
  issues: string[];
}

export interface CampaignCopyComplianceSummary {
  /** True ⟺ every evaluated field is shippable. */
  ok: boolean;
  /** Worst-case status across all fields. */
  decision: ComplianceDecisionStatus;
  fields: FieldComplianceMeta[];
}

/** Body returned with HTTP 422 when compliance fails closed. */
export interface CampaignCopyComplianceErrorBody {
  error: "compliance_failed";
  message: string;
  locale: LocaleCode;
  /** The subset of fields that were not shippable. */
  blockedFields: FieldComplianceMeta[];
  compliance: CampaignCopyComplianceSummary;
}

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
  /**
   * Structured per-field compliance verdict. Present on 2xx responses; every
   * field here is shippable (auto_approved or safely rewritten). A blocked /
   * escalated field never reaches a 2xx response — the endpoint returns 422
   * with CampaignCopyComplianceErrorBody instead.
   */
  compliance?: CampaignCopyComplianceSummary;
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
  /** Structured per-field compliance verdict for this concept (all fields shippable). */
  compliance?: CampaignCopyComplianceSummary;
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
