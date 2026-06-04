/**
 * DUAL VALIDATOR DECISION LAYER
 * Combines semantic and independent validation results into deterministic decisions.
 */

import { LocaleCode, SourceRef } from "@mexem/shared";
import { validateSemanticCompliance, SemanticValidationResult } from "./semantic-compliance";
import { validateComplianceIndependently, IndependentValidationResult } from "./independent-validator";
import { loadBundle, LoadedBundle } from "../compliance/bundles/loader";
import { executeBundleRules, BundleRuleMatch } from "../compliance/engine/executor";

export type DecisionStatus = 'SAFE' | 'NON_COMPLIANT' | 'BORDERLINE' | 'UNCERTAIN';
export type RiskLevel = 'LOW_RISK' | 'MEDIUM_RISK' | 'HIGH_RISK';
export type FinalAction = 'auto_approved' | 'rewritten' | 'escalated_to_human_review' | 'blocked';

export type SemanticValidatorFn = (text: string, locale: LocaleCode, bundlePromptContext?: string) => Promise<SemanticValidationResult>;
export type IndependentValidatorFn = (text: string, locale: LocaleCode, useDifferentModel?: boolean, bundlePromptContext?: string) => Promise<IndependentValidationResult>;

export interface ComplianceDecisionResult {
  status: DecisionStatus;
  riskLevel: RiskLevel;
  finalAction: FinalAction;
  finalConfidence: number; // 0-100
  semanticResult: SemanticValidationResult;
  independentResult: IndependentValidationResult;
  preRewriteStatus: DecisionStatus;
  postRewriteStatus?: DecisionStatus;
  originalText: string;
  finalText: string;
  issues: string[];
  uncertainCaseLogged: boolean;
  logId?: string;
  /** Published bundle version used, if any (e.g. "en-GB@1.0.0"). Null = legacy rules. */
  bundleVersion?: string | null;
  /** Source references from the bundle. */
  sourceRefs?: SourceRef[];
  /** Deterministic rule matches from the bundle executor. */
  bundleRuleMatches?: BundleRuleMatch[];
}

export interface DecisionConfig {
  semanticWeight: number;
  independentWeight: number;
  disagreementPenalty: number;
  lowRiskThreshold: number;
  highRiskThreshold: number;
  humanReviewThreshold: number;
  conservativeFallbackEnabled: boolean;
}

const DEFAULT_DECISION_CONFIG: DecisionConfig = {
  semanticWeight: parseFloat(process.env.SEMANTIC_WEIGHT || '0.7'),
  independentWeight: parseFloat(process.env.INDEPENDENT_WEIGHT || '0.3'),
  disagreementPenalty: parseFloat(process.env.DISAGREEMENT_PENALTY || '10'),
  lowRiskThreshold: parseFloat(process.env.LOW_RISK_THRESHOLD || '70'),
  highRiskThreshold: parseFloat(process.env.HIGH_RISK_THRESHOLD || '85'),
  humanReviewThreshold: parseFloat(process.env.HUMAN_REVIEW_THRESHOLD || '55'),
  conservativeFallbackEnabled: true
};

const uncertainCaseStoragePath = process.env.UNCERTAIN_CASE_LOG_PATH || './uncertain-cases.log';

function buildDecisionKey(
  semantic: DecisionStatus,
  independent: DecisionStatus,
  semanticConfidence: number = 0,
  independentConfidence: number = 0
): DecisionStatus {
  if (semantic === 'SAFE' && independent === 'SAFE') return 'SAFE';
  if (semantic === 'NON_COMPLIANT' && independent === 'NON_COMPLIANT') return 'NON_COMPLIANT';
  if (semantic === 'BORDERLINE' && independent === 'BORDERLINE') return 'BORDERLINE';
  if (semantic === 'SAFE' && independent === 'BORDERLINE') return 'BORDERLINE';
  if (semantic === 'BORDERLINE' && independent === 'SAFE') return 'BORDERLINE';

  // When validators disagree: semantic carries more weight (0.7 vs 0.3).
  // If semantic is confident (≥80%) and says SAFE, treat as BORDERLINE not UNCERTAIN.
  // Only escalate to NON_COMPLIANT if the independent is also highly confident and semantic is not.
  if (semantic === 'SAFE' && independent === 'NON_COMPLIANT') {
    if (semanticConfidence >= 80) return 'BORDERLINE';
    if (independentConfidence >= 80 && semanticConfidence < 60) return 'NON_COMPLIANT';
    return 'UNCERTAIN';
  }
  if (semantic === 'NON_COMPLIANT' && independent === 'SAFE') {
    if (independentConfidence >= 80) return 'BORDERLINE';
    if (semanticConfidence >= 80 && independentConfidence < 60) return 'NON_COMPLIANT';
    return 'UNCERTAIN';
  }

  return 'UNCERTAIN';
}

function mapClassificationToStatus(classification: 'COMPLIANT' | 'NON-COMPLIANT' | 'BORDERLINE' | 'AMBIGUOUS'): DecisionStatus {
  if (classification === 'COMPLIANT') return 'SAFE';
  if (classification === 'NON-COMPLIANT') return 'NON_COMPLIANT';
  return 'BORDERLINE';
}

function fuseConfidence(
  semanticConfidence: number,
  independentConfidence: number,
  config: DecisionConfig,
  disagreement: boolean
): number {
  const weighted = (semanticConfidence * config.semanticWeight + independentConfidence * config.independentWeight) / (config.semanticWeight + config.independentWeight);
  if (!disagreement) {
    return Math.round(Math.min(100, Math.max(0, weighted)));
  }

  const penalized = Math.max(0, weighted - config.disagreementPenalty);
  return Math.round(penalized);
}

function determineRiskLevel(
  status: DecisionStatus,
  finalConfidence: number,
  semanticResult: SemanticValidationResult,
  independentResult: IndependentValidationResult
): RiskLevel {
  if (status === 'NON_COMPLIANT') return 'HIGH_RISK';

  if (status === 'UNCERTAIN') {
    return 'HIGH_RISK';
  }

  if (status === 'BORDERLINE') {
    return finalConfidence >= DEFAULT_DECISION_CONFIG.highRiskThreshold ? 'MEDIUM_RISK' : 'LOW_RISK';
  }

  if (finalConfidence >= DEFAULT_DECISION_CONFIG.highRiskThreshold) {
    return 'LOW_RISK';
  }

  if (finalConfidence >= DEFAULT_DECISION_CONFIG.lowRiskThreshold) {
    return 'MEDIUM_RISK';
  }

  return 'HIGH_RISK';
}

function determineFinalAction(
  status: DecisionStatus,
  postRewriteStatus?: DecisionStatus,
  finalTextChanged: boolean = false
): FinalAction {
  if (status === 'SAFE' && !finalTextChanged) return 'auto_approved';
  if (status === 'SAFE' && finalTextChanged) return 'rewritten';
  if (status === 'NON_COMPLIANT' && postRewriteStatus === 'SAFE') return 'rewritten';
  if (status === 'NON_COMPLIANT') return 'blocked';
  if (status === 'BORDERLINE' || status === 'UNCERTAIN') {
    if (postRewriteStatus === 'SAFE') return 'rewritten';
    return 'escalated_to_human_review';
  }
  return 'escalated_to_human_review';
}

function getJurisdictionDisclaimer(locale: LocaleCode): string {
  const disclaimers: Record<string, string> = {
    "it-IT": "Investimenti finanziari comportano rischi, inclusa la perdita del capitale. Consultare un professionista finanziario.",
    "fr-FR": "Les investissements financiers comportent des risques, y compris la perte du capital. Consultez un conseiller financier.",
    "nl-NL": "Financiële investeringen brengen risico's met zich mee, inclusief verlies van kapitaal. Raadpleeg een financieel adviseur.",
    "nl-BE": "Financiële investeringen brengen risico's met zich mee, inclusief verlies van kapitaal. Raadpleeg een financieel adviseur.",
    "fr-BE": "Les investissements financiers comportent des risques, y compris la perte du capital. Consultez un conseiller financier.",
    "es-ES": "Las inversiones financieras conllevan riesgos, incluyendo la pérdida del capital. Consulte a un asesor financiero.",
    "en-GB": "Financial investments carry risk, including the potential loss of capital. Seek independent financial advice if unsure.",
    "de-DE": "Finanzinvestitionen bergen Risiken, einschließlich des Verlusts des eingesetzten Kapitals. Konsultieren Sie einen Finanzberater.",
    "pt-PT": "Os investimentos financeiros envolvem riscos, incluindo a perda de capital. Consulte um assessor financeiro."
  };
  return disclaimers[locale] || "Financial investments involve risk, including loss of capital. Consult a financial advisor.";
}

function applyConservativeFallback(text: string, locale: LocaleCode): string {
  const disclaimer = getJurisdictionDisclaimer(locale);
  let fallback = text;

  const urgencyPatterns = [
    /\b(limited time|only \d+ (spots|seats|places|positions) left|act now|don't miss out|expires soon|last chance|while stocks last|today only|urgent|immediately|as soon as possible)\b/gi
  ];
  const tonePatterns = [
    /\b(best|amazing|revolutionary|elite|premium|award-winning|top platform|trusted worldwide|guaranteed|assured|certain|risk-free|safe|secure)\b/gi,
    /\b(expert|expertise|professional-grade|VIP|exclusive|recommended by experts|approved by|endorsed by)\b/gi
  ];

  urgencyPatterns.forEach(pattern => { fallback = fallback.replace(pattern, ''); });
  tonePatterns.forEach(pattern => { fallback = fallback.replace(pattern, ''); });

  fallback = fallback.replace(/\s{2,}/g, ' ').trim();

  if (!/risk/i.test(fallback)) {
    fallback = `${fallback} All trading involves risk and can result in loss of capital.`;
  }

  fallback = `${fallback}\n\n${disclaimer}`;

  return fallback;
}

function buildCaseLogId(): string {
  return `uncertain-${Date.now()}-${Math.floor(Math.random() * 100000)}`;
}

function logUncertainCase(entry: ComplianceDecisionResult): void {
  if (!entry.uncertainCaseLogged) return;

  const logEntry = {
    id: entry.logId,
    timestamp: new Date().toISOString(),
    locale: entry.semanticResult ? entry.semanticResult : undefined,
    decision: entry.status,
    riskLevel: entry.riskLevel,
    finalConfidence: entry.finalConfidence,
    finalAction: entry.finalAction,
    originalText: entry.originalText,
    issues: entry.issues,
    semanticResult: entry.semanticResult,
    independentResult: entry.independentResult,
    preRewriteStatus: entry.preRewriteStatus,
    postRewriteStatus: entry.postRewriteStatus
  };

  try {
    const fs = require('fs');
    const line = JSON.stringify(logEntry);
    fs.appendFileSync(uncertainCaseStoragePath, `${line}\n`, { encoding: 'utf8' });
  } catch (error) {
    console.error('Failed to log uncertain case:', error);
  }
}

export async function makeComplianceDecision(
  text: string,
  locale: LocaleCode,
  config: DecisionConfig = DEFAULT_DECISION_CONFIG
): Promise<ComplianceDecisionResult> {
  // Load the published bundle (cached, non-blocking if none)
  const bundle = await loadBundle(locale);
  return makeComplianceDecisionWithValidators(text, locale, config, undefined, undefined, bundle);
}

export async function makeComplianceDecisionWithValidators(
  text: string,
  locale: LocaleCode,
  config: DecisionConfig = DEFAULT_DECISION_CONFIG,
  semanticValidator: SemanticValidatorFn = validateSemanticCompliance,
  independentValidator: IndependentValidatorFn = validateComplianceIndependently,
  bundle: LoadedBundle | null = null
): Promise<ComplianceDecisionResult> {
  // ── Bundle deterministic checks (fast, no LLM) ──────────────────────
  let bundleExec: ReturnType<typeof executeBundleRules> | null = null;
  if (bundle) {
    bundleExec = executeBundleRules(text, bundle);
  }

  const promptCtx = bundle?.content.promptContext || undefined;
  const semanticResult = await semanticValidator(text, locale, promptCtx);
  const independentResult = await independentValidator(text, locale, false, promptCtx);

  const semanticStatus = mapClassificationToStatus(semanticResult.classification);
  const independentStatus = mapClassificationToStatus(independentResult.classification);

  // ── Bundle-clean override ─────────────────────────────────────────
  // When the bundle executor found ZERO hard-rule matches AND the semantic
  // validator (the primary, higher-weighted reviewer) says COMPLIANT,
  // the conservative independent validator's lone dissent should not block.
  //
  // This prevents the chronic false-positive problem where the independent
  // validator (tuned "when in doubt → NON-COMPLIANT") flags clean marketing
  // text for vague reasons.
  //
  // Critically, if the semantic validator ALSO says NON-COMPLIANT, the
  // override does NOT fire — both reviewers agreeing on a problem is a
  // genuine signal that should go to human review, even without hard rules.
  //
  // This override NEVER fires when any hard rule matched.
  const bundleIsClean = !bundleExec || bundleExec.passed;
  const semanticSaysCompliant = semanticStatus === 'SAFE';

  if (bundleIsClean && semanticSaysCompliant && independentStatus !== 'SAFE') {
    const fusedConf = fuseConfidence(semanticResult.confidence, independentResult.confidence, config, true);
    const finalRisk = determineRiskLevel('SAFE', fusedConf, semanticResult, independentResult);
    const result: ComplianceDecisionResult = {
      status: 'SAFE',
      riskLevel: finalRisk,
      finalAction: 'auto_approved',
      finalConfidence: fusedConf,
      semanticResult,
      independentResult,
      preRewriteStatus: 'SAFE',
      originalText: text,
      finalText: text,
      issues: [],
      uncertainCaseLogged: false,
      bundleVersion: bundleExec?.bundleVersion ?? null,
      sourceRefs: bundleExec?.sourceRefs ?? [],
      bundleRuleMatches: bundleExec?.matches ?? [],
    };
    return result;
  }

  const preRewriteStatus = buildDecisionKey(semanticStatus, independentStatus, semanticResult.confidence, independentResult.confidence);
  const disagreement = semanticStatus !== independentStatus;

  const finalConfidence = fuseConfidence(semanticResult.confidence, independentResult.confidence, config, disagreement);
  const initialRisk = determineRiskLevel(preRewriteStatus, finalConfidence, semanticResult, independentResult);

  let finalText = text;
  let postRewriteStatus: DecisionStatus | undefined;
  let finalStatus = preRewriteStatus;
  let finalAction: FinalAction = 'auto_approved';

  if (preRewriteStatus === 'SAFE') {
    finalStatus = 'SAFE';
    finalAction = 'auto_approved';
  } else if (preRewriteStatus === 'NON_COMPLIANT') {
    finalText = applyConservativeFallback(text, locale);
    const semanticAfter = await semanticValidator(finalText, locale, promptCtx);
    const independentAfter = await independentValidator(finalText, locale, false, promptCtx);
    const semanticAfterStatus = mapClassificationToStatus(semanticAfter.classification);
    const independentAfterStatus = mapClassificationToStatus(independentAfter.classification);
    postRewriteStatus = buildDecisionKey(semanticAfterStatus, independentAfterStatus, semanticAfter.confidence, independentAfter.confidence);
    finalStatus = postRewriteStatus;
    finalAction = determineFinalAction(preRewriteStatus, postRewriteStatus, finalText !== text);
  } else if (preRewriteStatus === 'BORDERLINE' || preRewriteStatus === 'UNCERTAIN') {
    finalText = applyConservativeFallback(text, locale);
    const semanticAfter = await semanticValidator(finalText, locale, promptCtx);
    const independentAfter = await independentValidator(finalText, locale, false, promptCtx);
    const semanticAfterStatus = mapClassificationToStatus(semanticAfter.classification);
    const independentAfterStatus = mapClassificationToStatus(independentAfter.classification);
    postRewriteStatus = buildDecisionKey(semanticAfterStatus, independentAfterStatus, semanticAfter.confidence, independentAfter.confidence);
    finalStatus = postRewriteStatus === 'SAFE' ? 'SAFE' : preRewriteStatus;
    finalAction = determineFinalAction(preRewriteStatus, postRewriteStatus, finalText !== text);
  }

  // Bundle escalation must happen before deriving finalRisk / finalAction so
  // those fields are always consistent with the true final status.
  // Deterministic hard-rule matches take precedence over the LLM consensus.
  if (bundleExec && !bundleExec.passed && finalStatus === 'SAFE') {
    const hasCritical = bundleExec.matches.some(m => m.severity === 'critical');
    finalStatus = hasCritical ? 'NON_COMPLIANT' : 'BORDERLINE';
    // Re-derive action from the escalated status so it never contradicts.
    finalAction = determineFinalAction(finalStatus, postRewriteStatus, finalText !== text);
  }

  // Derive risk and action from the settled final status.
  const finalRisk = determineRiskLevel(finalStatus, finalConfidence, semanticResult, independentResult);

  // Compliance issues that the UI exposes should reflect the fused decision,
  // not the raw output of each validator. The independent validator is explicitly
  // tuned to over-flag ("when in doubt → NON-COMPLIANT") and the semantic one
  // sometimes hallucinates concerns on clean text. If the fusion layer says SAFE,
  // those flags were already rejected as noise and showing them only confuses reviewers.
  //
  // - SAFE: suppress all flags (trust the decision).
  // - BORDERLINE: show the intersection — concerns both validators independently raised.
  // - NON_COMPLIANT / UNCERTAIN: show the full union so reviewers see every signal.
  const rawSemantic = semanticResult.issues ?? [];
  const rawIndependent = independentResult.violations ?? [];
  const unionIssues = Array.from(new Set([...rawSemantic, ...rawIndependent]));
  const normalize = (s: string) => s.toLowerCase().replace(/[^a-z0-9\s]/g, '').trim();
  const semanticKeys = new Set(rawSemantic.map(normalize));
  const intersectionIssues = rawIndependent.filter(v => semanticKeys.has(normalize(v)));

  const issues =
    finalStatus === 'SAFE' ? [] :
    finalStatus === 'BORDERLINE' ? intersectionIssues :
    unionIssues;

  const uncertainCaseLogged = finalStatus === 'UNCERTAIN' || preRewriteStatus === 'UNCERTAIN' || preRewriteStatus === 'BORDERLINE';
  const logId = uncertainCaseLogged ? buildCaseLogId() : undefined;

  // Merge bundle rule match messages into the issues list when applicable
  const bundleIssueTexts = bundleExec?.matches.map(m => m.message) ?? [];
  const mergedIssues = finalStatus === 'SAFE'
    ? []
    : [...issues, ...bundleIssueTexts.filter(t => !issues.includes(t))];

  const result: ComplianceDecisionResult = {
    status: finalStatus,
    riskLevel: finalRisk,
    finalAction,
    finalConfidence,
    semanticResult,
    independentResult,
    preRewriteStatus,
    postRewriteStatus,
    originalText: text,
    finalText,
    issues: mergedIssues,
    uncertainCaseLogged,
    logId,
    bundleVersion: bundleExec?.bundleVersion ?? null,
    sourceRefs: bundleExec?.sourceRefs ?? [],
    bundleRuleMatches: bundleExec?.matches ?? [],
  };

  if (uncertainCaseLogged) {
    result.uncertainCaseLogged = true;
    result.logId = logId;
    logUncertainCase(result);
  }

  return result;
}
