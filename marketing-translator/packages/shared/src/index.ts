export type LocaleCode = "it-IT" | "fr-FR" | "nl-NL" | "nl-BE" | "fr-BE" | "es-ES" | "en-GB";

export * from "./compliance";
export * from "./publisher";
export * from "./campaign-copy";

export interface LocaleOption {
  code: LocaleCode;
  label: string;
  language: string;
  country: string;
}

export interface TextTypeOption {
  id: string;
  label: string;
}

export interface PersonaOption {
  id: string;
  label: string;
}

export interface ToneOption {
  id: string;
  label: string;
}

export interface LengthConstraint {
  mode: "exact" | "near" | "max" | "range";
  exactChars?: number;
  maxChars?: number;
  maxWords?: number;
  minChars?: number;
  maxCharsRange?: number;
  minWords?: number;
  maxWordsRange?: number;
}

export interface TranslationRequest {
  sourceText: string;
  sourceLanguage: string;
  targetLocale: LocaleCode;
  textType: string;
  persona: string;
  tone: string | string[];
  lengthConstraint: LengthConstraint;
  requiredTerms?: string[];
  forbiddenTerms?: string[];
  complianceNotes?: string;
  campaignContext?: string;
  outputCount?: number;
  /** Previous versions already generated — backend will avoid duplicating them. */
  existingVersions?: string[];
  /** Offset into the versionHints/versionTemps arrays so follow-up calls use different hints/temperatures. */
  versionOffset?: number;
}

export interface TranslationOutput {
  id?: number;
  version: number;
  outputText: string;
  score?: number;
  validation?: Record<string, unknown> & { compliance?: { compliant: boolean; issues: string[]; suggestions: string[] } };
  approved?: boolean;
}

export interface TranslationJobSummary {
  id: number;
  sourceText: string;
  sourceLanguage: string;
  targetLocale: LocaleCode;
  textType: string;
  persona: string;
  tone: string;
  outputCount: number;
  status: string;
  createdAt: string;
  outputs: TranslationOutput[];
}

export interface GlossaryTerm {
  id?: number;
  sourceTerm: string;
  targetTerm: string;
  localeCode?: LocaleCode | null;
  required: boolean;
  forbidden: boolean;
  notes?: string;
}

export interface GlossaryTermCreate {
  sourceTerm: string;
  targetTerm: string;
  localeCode?: LocaleCode | null;
  required: boolean;
  forbidden: boolean;
  notes?: string;
}

export interface TranslationMemoryEntry {
  id?: number;
  sourceText: string;
  targetText: string;
  sourceLanguage: string;
  targetLocale: LocaleCode;
  textType: string;
  createdAt?: string;
}

/** @deprecated Use ReviewRequest instead */
export interface ApprovalRequest {
  approved: boolean;
  note?: string;
}

export type ReviewDecision = "approved" | "rejected";

export type ReviewIssueCode =
  | "tone"
  | "terminology"
  | "grammar"
  | "fluency"
  | "literal_translation"
  | "brand_voice"
  | "register";

export interface ReviewRequest {
  decision: ReviewDecision;
  note?: string;
  issueCodes?: ReviewIssueCode[];
  correctedTranslation?: string;
  reviewerId?: string;
  /**
   * Phrases the reviewer wants the AI to never produce again for the
   * output's target locale. Each becomes a ForbiddenPhrase row. Backend
   * honours this field only for REVIEWER+ roles; values from a plain USER
   * are silently dropped to prevent prompt poisoning.
   */
  forbiddenPhrases?: string[];
}

export interface TranslationReview {
  id: number;
  outputId: number;
  decision: ReviewDecision;
  note?: string | null;
  issueCodes?: ReviewIssueCode[];
  correctedTranslation?: string | null;
  reviewerId?: string | null;
  createdAt: string;
}

// ─── Quality gate types ────────────────────────────────────────────

export type QualityIssueCode =
  | "tone"
  | "terminology"
  | "fluency"
  | "adequacy"
  | "formatting"
  | "placeholder"
  | "grammar"
  | "literal_translation";

export type QualityIssueSeverity = "minor" | "major" | "critical";

export interface QualityIssue {
  code: QualityIssueCode;
  severity: QualityIssueSeverity;
  message: string;
}

export type QualityReviewStage = "initial" | "repair" | "regeneration";

export interface QualityGateSummary {
  score: number;
  approved: boolean;
  stage: QualityReviewStage;
  issues: QualityIssue[];
  hardCheckIssues: Array<{ code: string; severity: string; message: string }>;
}
