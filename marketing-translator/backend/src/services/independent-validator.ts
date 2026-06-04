/**
 * INDEPENDENT COMPLIANCE VALIDATOR
 * Separate model/prompt for evaluation to avoid bias
 * Uses strict, rule-based criteria for objective assessment
 */

import { LocaleCode } from "@mexem/shared";
import { buildRulesBlock } from "./jurisdictionRules";
import { lazyOpenAI } from "./openaiHelpers";

const openai = lazyOpenAI();

/** A single strict-audit concern with the exact substring from the input
 *  that triggered it. Same shape as SemanticFinding for symmetry, kept
 *  local so this file has no upstream-validator dependency. */
export interface IndependentFinding {
  category: string;
  /** Verbatim substring from the input. May be empty for "missing" concerns. */
  quote: string;
  severity: 'critical' | 'major' | 'minor';
}

export interface IndependentValidationResult {
  classification: 'COMPLIANT' | 'NON-COMPLIANT' | 'BORDERLINE';
  confidence: number;
  violations: string[];
  /** Structured findings with verbatim quotes. Present when the LLM
   *  returned the richer shape; older deployments may have only `violations`. */
  findings?: IndependentFinding[];
  severity: number;
  reasoning: string;
  regulatoryBasis: string;
}

/**
 * INDEPENDENT VALIDATOR - STRICT CRITERIA
 * Uses a separate prompt and potentially different model
 * Focuses on objective regulatory compliance assessment
 */
export async function validateComplianceIndependently(
  text: string,
  locale: LocaleCode,
  useDifferentModel: boolean = false,
  bundlePromptContext?: string
): Promise<IndependentValidationResult> {
  const model = useDifferentModel ? "gpt-4" : "gpt-4o-mini";
  const prompt = buildIndependentValidationPrompt(text, locale, bundlePromptContext);

  try {
    const response = await openai.chat.completions.create({
      model: model,
      messages: [
        {
          role: "system",
          content: "You are a strict financial compliance auditor. Apply regulatory rules literally and conservatively. When in doubt, classify as NON-COMPLIANT. Respond only with valid JSON."
        },
        {
          role: "user",
          content: prompt
        }
      ],
      temperature: 0.0, // Zero temperature for maximum consistency
      max_tokens: 1000
    });

    const result = JSON.parse(response.choices[0].message.content || '{}');

    const findings: IndependentFinding[] = Array.isArray(result.findings)
      ? result.findings
          .map((f: any) => ({
            category: String(f?.category ?? '').trim(),
            quote: typeof f?.quote === 'string' ? f.quote.trim() : '',
            severity: normaliseSeverity(f?.severity),
          }))
          .filter((f: IndependentFinding) => f.category.length > 0)
      : [];

    const violations = findings.length > 0
      ? Array.from(new Set(findings.map((f) => f.category)))
      : (Array.isArray(result.violations) ? result.violations : []);

    return {
      classification: result.classification || 'BORDERLINE',
      confidence: Math.min(100, Math.max(0, result.confidence || 50)),
      violations,
      findings: findings.length > 0 ? findings : undefined,
      severity: Math.min(10, Math.max(1, result.severity || 5)),
      reasoning: result.reasoning || 'No reasoning provided',
      regulatoryBasis: result.regulatoryBasis || 'General regulatory principles'
    };

  } catch (error) {
    console.error('Independent validation error:', error);
    return {
      classification: 'BORDERLINE',
      confidence: 0,
      violations: ['validation_error'],
      severity: 5,
      reasoning: 'Validation system error',
      regulatoryBasis: 'Unable to determine'
    };
  }
}

/**
 * STRICT INDEPENDENT VALIDATION PROMPT
 * Conservative, rule-based assessment criteria
 */
function buildIndependentValidationPrompt(text: string, locale: LocaleCode, bundlePromptContext?: string): string {
  return `FINANCIAL COMPLIANCE AUDIT - STRICT ASSESSMENT

CONTENT UNDER REVIEW:
"${text}"

${buildRulesBlock(locale, bundlePromptContext)}

CLASSIFICATION RULES:
- COMPLIANT: Factual product/feature descriptions with no investment return or performance claims
- NON-COMPLIANT: Contains any hard prohibition above, or explicit/implied claims about returns, profits, or safety of capital
- BORDERLINE: Ambiguous phrasing that could be read as either a product feature or a performance claim

FINDINGS RULES (IMPORTANT):
- For each violation, include the VERBATIM substring from the input that triggered it in the "quote" field.
- "quote" must be a character-by-character copy of a contiguous span from CONTENT UNDER REVIEW — never paraphrase, translate or summarise.
- If a violation is about something MISSING from the text (e.g. an absent disclaimer), leave "quote" empty.
- Keep "quote" to the shortest meaningful span — usually 1–6 words.
- One finding per offending phrase; same category × different phrases = two findings.

RESPONSE FORMAT (JSON only):
{
  "classification": "COMPLIANT|NON-COMPLIANT|BORDERLINE",
  "confidence": 0-100,
  "findings": [
    { "category": "no_guarantees", "quote": "exact substring from input", "severity": "critical|major|minor" }
  ],
  "violations": ["category_for_backward_compat_1", "category_for_backward_compat_2"],
  "severity": 1-10,
  "reasoning": "brief explanation of decision",
  "regulatoryBasis": "specific regulatory reference"
}`;
}

function normaliseSeverity(v: any): 'critical' | 'major' | 'minor' {
  const s = String(v ?? '').toLowerCase();
  if (s === 'critical') return 'critical';
  if (s === 'major') return 'major';
  return 'minor';
}

/**
 * COMPARE VALIDATION RESULTS
 * Identifies discrepancies between semantic and independent validation
 */
export function compareValidationResults(
  semanticResult: any,
  independentResult: IndependentValidationResult
): {
  agreement: boolean;
  semanticClassification: string;
  independentClassification: string;
  discrepancies: string[];
} {
  const semanticCompliant = semanticResult.compliant;
  const independentCompliant = independentResult.classification === 'COMPLIANT';

  const agreement = semanticCompliant === independentCompliant;

  const discrepancies: string[] = [];
  if (!agreement) {
    discrepancies.push('classification_mismatch');
  }

  // Check for violation differences
  const semanticViolations = semanticResult.issues || [];
  const independentViolations = independentResult.violations;

  if (semanticViolations.length !== independentViolations.length) {
    discrepancies.push('violation_count_mismatch');
  }

  return {
    agreement,
    semanticClassification: semanticCompliant ? 'COMPLIANT' : 'NON-COMPLIANT',
    independentClassification: independentResult.classification,
    discrepancies
  };
}

