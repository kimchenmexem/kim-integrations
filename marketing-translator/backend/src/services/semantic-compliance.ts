/**
 * SEMANTIC COMPLIANCE VALIDATION ENGINE
 * Primary validator using AI for meaning-based compliance detection
 */

import { LocaleCode } from "@mexem/shared";
import { buildRulesBlock } from "./jurisdictionRules";
import { lazyOpenAI } from "./openaiHelpers";

const openai = lazyOpenAI();

/** A single LLM-flagged concern with the exact substring from the input
 *  that triggered it, so the UI can highlight where it occurs. */
export interface SemanticFinding {
  /** Compliance category, e.g. "no_guarantees", "risk_balance". */
  category: string;
  /** Verbatim substring from the input that the LLM flagged. May be empty
   *  if the concern is "something missing" rather than "something present". */
  quote: string;
  /** LLM-assessed severity for this single finding. */
  severity: 'critical' | 'major' | 'minor';
}

export interface SemanticValidationResult {
  classification: 'COMPLIANT' | 'NON-COMPLIANT' | 'AMBIGUOUS';
  confidence: number; // 0-100
  issues: string[];
  /** Structured findings with verbatim quotes. Present when the LLM
   *  returned the richer shape; older deployments may have only `issues`. */
  findings?: SemanticFinding[];
  explanation: string;
  severity: number; // 1-10
  requiresRewrite: boolean;
}

export interface SemanticRewriteResult {
  rewrittenText: string;
  changesMade: string[];
  complianceImprovement: number; // 0-100
}

/**
 * PRIMARY SEMANTIC VALIDATOR
 * Uses AI to detect implied guarantees, promotional tone, and regulatory violations
 */
export async function validateSemanticCompliance(
  text: string,
  locale: LocaleCode,
  bundlePromptContext?: string
): Promise<SemanticValidationResult> {
  const prompt = buildSemanticValidationPrompt(text, locale, bundlePromptContext);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a financial compliance expert evaluating marketing content for regulatory compliance. Respond only with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.1, // Low temperature for consistent compliance decisions
      max_tokens: 500
    });

    const rawResponse = response.choices[0].message.content?.trim();
    // Debug logging removed for production
    const result = JSON.parse(rawResponse || '{}');

    const findings: SemanticFinding[] = Array.isArray(result.findings)
      ? result.findings
          .map((f: any) => ({
            category: String(f?.category ?? '').trim(),
            quote: typeof f?.quote === 'string' ? f.quote.trim() : '',
            severity: normaliseSeverity(f?.severity),
          }))
          .filter((f: SemanticFinding) => f.category.length > 0)
      : [];

    // Backwards-compat: derive `issues` from category if findings present.
    const issues = findings.length > 0
      ? Array.from(new Set(findings.map((f) => f.category)))
      : (result.issues || []);

    return {
      classification: result.classification || 'AMBIGUOUS',
      confidence: Math.min(100, Math.max(0, result.confidence || 50)),
      issues,
      findings: findings.length > 0 ? findings : undefined,
      explanation: result.explanation || 'Unable to determine',
      severity: Math.min(10, Math.max(1, result.severity || 5)),
      requiresRewrite: result.classification === 'NON-COMPLIANT'
    };

  } catch (error) {
    console.error('Semantic validation error:', error);
    // Fallback to ambiguous classification
    return {
      classification: 'AMBIGUOUS',
      confidence: 30,
      issues: ['Validation error - requires human review'],
      explanation: 'Technical error during semantic analysis',
      severity: 5,
      requiresRewrite: false
    };
  }
}

/**
 * SEMANTIC-AWARE REWRITE ENGINE
 * Rewrites content to neutralize violations while preserving marketing intent
 */
export async function rewriteForCompliance(
  text: string,
  issues: string[],
  locale: LocaleCode
): Promise<SemanticRewriteResult> {
  const prompt = buildRewritePrompt(text, issues, locale);

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [
        {
          role: "system",
          content: "You are a financial compliance editor. Rewrite marketing content to be compliant while preserving effectiveness."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.3, // Moderate creativity for effective rewrites
      max_tokens: 1000
    });

    const rewrittenText = response.choices[0].message.content?.trim() || text;

    // Analyze changes made
    const changesMade = analyzeRewriteChanges(text, rewrittenText);
    const complianceImprovement = estimateComplianceImprovement(text, rewrittenText, issues);

    return {
      rewrittenText,
      changesMade,
      complianceImprovement
    };

  } catch (error) {
    console.error('Rewrite error:', error);
    return {
      rewrittenText: text,
      changesMade: [],
      complianceImprovement: 0
    };
  }
}

/**
 * SEMANTIC VALIDATION PROMPT BUILDER
 */
function buildSemanticValidationPrompt(text: string, locale: LocaleCode, bundlePromptContext?: string): string {
  return `You are a financial compliance expert evaluating marketing content for regulatory compliance.

CONTENT TO EVALUATE:
"${text}"

${buildRulesBlock(locale, bundlePromptContext)}

CLASSIFICATION RULES:
- COMPLIANT: Factual product/feature descriptions, neutral information, no return/profit/capital-safety claims
- NON-COMPLIANT: Explicit or implied claims about investment returns, profits, guaranteed outcomes, or risk-free investing; or any hard prohibition above
- AMBIGUOUS: Borderline cases where a claim could be read as either a product feature or a performance promise

FINDINGS RULES (IMPORTANT):
- For each concern you identify, include the VERBATIM substring from the input that triggered it in the "quote" field.
- "quote" must be an exact character-by-character copy of a contiguous span from CONTENT TO EVALUATE — do NOT paraphrase, translate, or summarise.
- If a concern is about something MISSING from the text (e.g. a required disclaimer is absent), leave "quote" empty.
- Pick the shortest meaningful span that conveys the issue (usually 1–6 words).
- One finding per offending phrase. If the same category triggers on two different phrases, return two findings.

RESPONSE FORMAT (JSON only):
{
  "classification": "COMPLIANT|NON-COMPLIANT|AMBIGUOUS",
  "confidence": 0-100,
  "findings": [
    { "category": "no_guarantees", "quote": "exact substring from input", "severity": "critical|major|minor" }
  ],
  "issues": ["category_for_backward_compat_1", "category_for_backward_compat_2"],
  "explanation": "brief explanation of classification",
  "severity": 1-10
}`;
}

function normaliseSeverity(v: any): 'critical' | 'major' | 'minor' {
  const s = String(v ?? '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'major') return 'major';
  return 'minor';
}

/**
 * REWRITE PROMPT BUILDER
 */
function buildRewritePrompt(text: string, issues: string[], locale: LocaleCode): string {
  return `You are a financial compliance editor. Rewrite the following marketing content to be compliant with the regulatory rules for ${locale}.

ORIGINAL CONTENT:
"${text}"

ISSUES IDENTIFIED:
${issues.map(issue => `- ${issue}`).join('\n')}

REWRITE REQUIREMENTS:
1. MINIMAL CHANGE: Make the smallest possible edits. Only modify wording required to fix compliance issues while preserving the rest of the sentence.
2. NEUTRALIZE TONE: Convert persuasive/marketing language to neutral, informational tone
3. REMOVE GUARANTEES: Eliminate any implied promises of profit or reduced risk
4. ADD RISK AWARENESS: Include risk disclaimers when discussing potential benefits
5. PRESERVE INTENT: Keep the core marketing message but make it compliant
6. PROFESSIONAL STYLE: Use factual language aligned with financial industry standards

SPECIFIC FIXES NEEDED:
${issues.map(issue => `- Address: ${issue}`).join('\n')}

REWRITTEN CONTENT:
[Provide only the rewritten marketing copy, no explanation]`;
}


function analyzeRewriteChanges(original: string, rewritten: string): string[] {
  const changes: string[] = [];

  // Check for tone neutralization
  if (original.match(/\b(best|amazing|revolutionary|guaranteed)\b/i) &&
      !rewritten.match(/\b(best|amazing|revolutionary|guaranteed)\b/i)) {
    changes.push('Removed superlatives and guarantees');
  }

  // Check for risk addition
  if (!original.toLowerCase().includes('risk') && rewritten.toLowerCase().includes('risk')) {
    changes.push('Added risk awareness');
  }

  // Check for urgency removal
  if (original.match(/\b(now|immediately|urgently|act fast)\b/i) &&
      !rewritten.match(/\b(now|immediately|urgently|act fast)\b/i)) {
    changes.push('Removed urgency language');
  }

  return changes;
}

function estimateComplianceImprovement(original: string, rewritten: string, originalIssues: string[]): number {
  // Simple heuristic: count issue-related words removed
  const issueKeywords = ['guarantee', 'best', 'amazing', 'now', 'immediately', 'successful', 'wealth', 'freedom'];
  let originalScore = 0;
  let rewrittenScore = 0;

  issueKeywords.forEach(keyword => {
    if (original.toLowerCase().includes(keyword)) originalScore++;
    if (rewritten.toLowerCase().includes(keyword)) rewrittenScore++;
  });

  const improvement = originalScore > 0 ? ((originalScore - rewrittenScore) / originalScore) * 100 : 0;
  return Math.min(100, Math.max(0, improvement));
}

/**
 * HYBRID COMPLIANCE VALIDATION
 * Semantic-first approach with rule-based as secondary
 */
export async function validateComplianceHybrid(
  text: string,
  locale: LocaleCode
): Promise<{
  compliant: boolean;
  issues: string[];
  score: number;
  confidence: number;
  requiresReview: boolean;
  rewrittenText?: string;
}> {
  // Step 1: Semantic validation (primary)
  const semantic = await validateSemanticCompliance(text, locale);

  // Step 2: If compliant, apply light rule-based scoring
  if (semantic.classification === 'COMPLIANT') {
    const ruleScore = calculateRuleBasedScore(text, locale);
    return {
      compliant: true,
      issues: [],
      score: Math.min(10, (semantic.confidence / 10) + ruleScore),
      confidence: semantic.confidence,
      requiresReview: false
    };
  }

  // Step 3: If non-compliant, attempt rewrite
  if (semantic.classification === 'NON-COMPLIANT' && semantic.requiresRewrite) {
    const rewrite = await rewriteForCompliance(text, semantic.issues, locale);

    // Step 4: Re-validate rewritten content
    const revalidation = await validateSemanticCompliance(rewrite.rewrittenText, locale);

    if (revalidation.classification === 'COMPLIANT') {
      return {
        compliant: true,
        issues: [],
        score: Math.min(10, revalidation.confidence / 10),
        confidence: revalidation.confidence,
        requiresReview: false,
        rewrittenText: rewrite.rewrittenText
      };
    } else {
      // Rewrite didn't fix all issues
      return {
        compliant: false,
        issues: revalidation.issues,
        score: Math.max(0, revalidation.confidence / 10 - 2), // Penalty for failed rewrite
        confidence: revalidation.confidence,
        requiresReview: true,
        rewrittenText: rewrite.rewrittenText
      };
    }
  }

  // Step 5: Ambiguous cases require human review
  return {
    compliant: false,
    issues: semantic.issues,
    score: semantic.confidence / 10,
    confidence: semantic.confidence,
    requiresReview: true
  };
}

/**
 * LIGHT RULE-BASED SCORING (secondary)
 * Only applied after semantic compliance confirmed
 */
function calculateRuleBasedScore(text: string, locale: LocaleCode): number {
  // Simplified scoring - just check for basic compliance markers
  let score = 5; // Base score

  // Bonus for risk mentions
  if (text.toLowerCase().includes('risk')) score += 1;

  // Bonus for professional tone
  if (!text.match(/\b(best|amazing|guaranteed|now)\b/i)) score += 1;

  // Penalty for any remaining issues
  if (text.match(/\b(will|should|can expect)\b/i)) score -= 1;

  return Math.min(5, Math.max(0, score)); // Cap at 5 since semantic already passed
}