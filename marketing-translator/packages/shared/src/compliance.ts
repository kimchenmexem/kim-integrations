import type { LocaleCode } from "./index";

// ─── Enum-like string unions (validated at app layer with Zod) ──────

export type Jurisdiction = "EU" | "IT" | "FR" | "NL" | "BE" | "ES" | "GB" | "CY";

export type SourceFamilyCode =
  | "EUR_LEX"
  | "ESMA"
  | "FCA"
  | "AMF"
  | "AFM"
  | "FSMA"
  | "CNMV"
  | "CYSEC"
  | "CONSOB";

export type SourceType =
  | "REGULATION"
  | "DIRECTIVE"
  | "GUIDANCE"
  | "CIRCULAR"
  | "POSITION"
  | "HANDBOOK";

export type SourceCanonicality = "PRIMARY" | "SECONDARY" | "ADVISORY";

export type PollCadence = "on_demand" | "daily" | "weekly" | "monthly";

export type ObligationCategory =
  | "guarantees"
  | "urgency"
  | "authority"
  | "promotional"
  | "disclaimer"
  | "prominence"
  | "past_performance"
  | "suitability"
  | "risk_balance";

export type ObligationSeverity = "critical" | "major" | "minor";

export type ObligationStatus = "pending" | "reviewed" | "approved" | "rejected" | "superseded";

export type ComplianceRuleType =
  | "banned_phrase"
  | "regex"
  | "required_disclaimer"
  | "prominence"
  | "semantic_check"
  | "conditional_disclosure";

export type BundleStatus = "draft" | "published" | "superseded";

export type SyncRunStatus = "running" | "success" | "failed" | "partial";

export type ReviewTaskKind =
  | "source_diff"
  | "obligation_draft"
  | "bundle_publish"
  | "rule_change";

export type ReviewTaskStatus = "open" | "in_progress" | "decided";

export type ReviewDecisionOutcome = "approved" | "rejected" | "needs_changes";

// ─── Entity shapes (mirror Prisma models; JSON fields pre-parsed) ───

export interface RegulatorySource {
  id: number;
  code: SourceFamilyCode;
  name: string;
  regulator: string;
  jurisdiction: Jurisdiction;
  localeScope: LocaleCode[];
  sourceType: SourceType;
  canonicality: SourceCanonicality;
  parserKey: string;
  pollCadence: PollCadence;
  active: boolean;
  baseUrl?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceDocument {
  id: number;
  sourceId: number;
  externalRef: string;
  title: string;
  url?: string | null;
  language?: string | null;
  active: boolean;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceDocumentVersion {
  id: number;
  documentId: number;
  versionLabel: string;
  contentHash: string;
  /** rawContent / parsedText are audit-only — never exposed to the runtime pipeline. */
  rawContent: string;
  parsedText: string;
  fetchedAt: string;
  fetchedBy: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
}

/** Reference to the originating source material for an obligation/rule/bundle. */
export interface SourceRef {
  sourceCode: SourceFamilyCode;
  documentRef?: string;
  versionId?: number;
  quote?: string;
  url?: string;
}

export interface ComplianceObligation {
  id: number;
  title: string;
  description: string;
  jurisdiction: Jurisdiction;
  localeCode?: LocaleCode | null;
  category: ObligationCategory;
  severity: ObligationSeverity;
  status: ObligationStatus;
  sourceRefs: SourceRef[];
  approvedBy?: string | null;
  approvedAt?: string | null;
  createdBy?: string | null;
  createdAt: string;
  updatedAt: string;
}

/** Config shapes are type-narrowed by ruleType. */
export type ComplianceRuleConfig =
  | { kind: "banned_phrase"; phrases: string[]; matchWholeWord?: boolean }
  | { kind: "regex"; pattern: string; flags?: string; message?: string }
  | { kind: "required_disclaimer"; text: string; triggers?: string[] }
  | { kind: "prominence"; mustBeAsProminentAs: string[] }
  | { kind: "semantic_check"; prompt: string }
  | { kind: "conditional_disclosure"; whenPattern: string; requireText: string };

export interface ComplianceRule {
  id: number;
  obligationId: number;
  ruleType: ComplianceRuleType;
  config: ComplianceRuleConfig;
  localeCode?: LocaleCode | null;
  severity?: ObligationSeverity | null;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

/** Compiled content embedded in a RuleBundle. */
export interface RuleBundleContent {
  bannedPhrases: string[];
  regexRules: Array<{ pattern: string; flags?: string; message?: string; severity: ObligationSeverity }>;
  requiredDisclaimers: Array<{ text: string; triggers?: string[] }>;
  promptContext: string;
  disclaimers: { riskWarning: string; pastPerformance: string };
}

export interface RuleBundle {
  id: number;
  localeCode: LocaleCode;
  jurisdiction: Jurisdiction;
  version: string;
  status: BundleStatus;
  content: RuleBundleContent;
  contentHash: string;
  sourceRefs: SourceRef[];
  publishedAt?: string | null;
  publishedBy?: string | null;
  supersededAt?: string | null;
  notes?: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface SourceSyncRun {
  id: number;
  sourceId?: number | null;
  startedAt: string;
  finishedAt?: string | null;
  status: SyncRunStatus;
  triggeredBy: string;
  documentsFetched: number;
  versionsCreated: number;
  diffsDetected: number;
  errorMessage?: string | null;
  runLog?: Record<string, unknown> | null;
}

export interface LegalReviewTask {
  id: number;
  kind: ReviewTaskKind;
  refType: string;
  refId: number;
  title: string;
  status: ReviewTaskStatus;
  assignee?: string | null;
  decision?: ReviewDecisionOutcome | null;
  note?: string | null;
  createdAt: string;
  decidedAt?: string | null;
  decidedBy?: string | null;
}

// ─── Compliance Check (standalone check flow, no translation) ──────

export type ComplianceCheckStatus = "approved" | "review_required" | "rejected";
export type ComplianceCheckRiskLevel = "low" | "medium" | "high" | "critical";
export type ComplianceCheckRecommendedAction =
  | "publish_as_is"
  | "route_to_legal_review"
  | "do_not_publish";

export interface ComplianceCheckRequest {
  text: string;
  locale: LocaleCode;
  withSuggestedFixes?: boolean;
}

export interface ComplianceCheckMatchedRule {
  type: "banned_phrase" | "regex" | "required_disclaimer" | "llm_semantic" | "llm_independent";
  severity: "critical" | "major" | "minor";
  message: string;
  evidence?: string;
  sourceCode?: string;
}

export interface ComplianceCheckResponse {
  status: ComplianceCheckStatus;
  riskLevel: ComplianceCheckRiskLevel;
  locale: LocaleCode;
  country: string;
  regulatorsApplied: string[];
  bundleVersion: string | null;
  summary: string;
  issues: string[];
  matchedRules: ComplianceCheckMatchedRule[];
  sourceRefs: SourceRef[];
  recommendedAction: ComplianceCheckRecommendedAction;
  confidence: number; // 0-100
  needsHumanReview: boolean;
  suggestedFixes?: Array<{ rewrittenText: string; changesMade: string[] }>;
  checkedAt: string;
}

// ─── Seed-time shape (registry entries as authored in code) ─────────

export interface RegulatorySourceSeed {
  code: SourceFamilyCode;
  name: string;
  regulator: string;
  jurisdiction: Jurisdiction;
  localeScope: LocaleCode[];
  sourceType: SourceType;
  canonicality: SourceCanonicality;
  parserKey: string;
  pollCadence: PollCadence;
  active: boolean;
  baseUrl?: string;
  notes?: string;
}
