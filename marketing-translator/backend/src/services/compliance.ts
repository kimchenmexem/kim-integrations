import { LocaleCode } from "@mexem/shared";
import { makeComplianceDecision, ComplianceDecisionResult } from "./decision-layer";
import { lazyOpenAI } from "./openaiHelpers";

const openai = lazyOpenAI();

export interface ComplianceCategory {
  name: string;
  patterns: (string | RegExp)[];
  severity: number; // 1-10, higher is worse
  description: string;
}

export interface RegulatorRules {
  regulator: string;
  disclaimer: string;
  toneGuidelines: string;
  additionalConstraints: string[];
  categories: ComplianceCategory[];
}

const regulatorRules: Record<LocaleCode, RegulatorRules> = {
  "it-IT": {
    regulator: "ESMA/CySEC",
    disclaimer: "Investimenti finanziari comportano rischi, inclusa la perdita del capitale. Consultare un professionista finanziario.",
    toneGuidelines: "Maintain neutral, informational tone. Avoid urgency or guarantees.",
    additionalConstraints: ["No future performance claims", "Include risk warnings"],
    categories: [
      {
        name: "guarantees",
        patterns: [/garantit/i, /sicuro/i, /senza rischio/i, /100% sicuro/i],
        severity: 9,
        description: "Implied or explicit guarantees of returns or safety"
      },
      {
        name: "urgency",
        patterns: [/subito/i, /ora/i, /limitato/i, /ultima occasione/i],
        severity: 7,
        description: "Creating false urgency or scarcity"
      },
      {
        name: "authority",
        patterns: [/migliore/i, /top/i, /leader/i, /numero uno/i],
        severity: 6,
        description: "False authority or superiority claims"
      },
      {
        name: "promotional",
        patterns: [/facile/i, /semplice/i, /veloce/i, /senza sforzo/i],
        severity: 5,
        description: "Overly promotional or simplified claims"
      }
    ]
  },
  "fr-FR": {
    regulator: "AMF",
    disclaimer: "Les investissements financiers comportent des risques, y compris la perte du capital. Consultez un conseiller financier.",
    toneGuidelines: "Use professional, factual language. Avoid emotional appeals.",
    additionalConstraints: ["No past performance guarantees", "Clear risk disclosure"],
    categories: [
      {
        name: "guarantees",
        patterns: [/garanti/i, /sûr/i, /sans risque/i, /100% sûr/i],
        severity: 9,
        description: "Implied or explicit guarantees"
      },
      {
        name: "urgency",
        patterns: [/immédiatement/i, /maintenant/i, /limité/i, /dernière chance/i],
        severity: 7,
        description: "False urgency"
      },
      {
        name: "authority",
        patterns: [/meilleur/i, /top/i, /leader/i, /numéro un/i],
        severity: 6,
        description: "False authority claims"
      },
      {
        name: "promotional",
        patterns: [/facile/i, /simple/i, /rapide/i, /sans effort/i],
        severity: 5,
        description: "Promotional language"
      }
    ]
  },
  "nl-NL": {
    regulator: "AFM",
    disclaimer: "Financiële investeringen brengen risico's met zich mee, inclusief verlies van kapitaal. Raadpleeg een financieel adviseur.",
    toneGuidelines: "Direct and neutral. Avoid speculative claims.",
    additionalConstraints: ["No guaranteed outcomes", "Risk-first disclosures"],
    categories: [
      {
        name: "guarantees",
        patterns: [/gegarandeerd/i, /veilig/i, /risicovrij/i, /100% veilig/i],
        severity: 9,
        description: "Guarantees of safety or returns"
      },
      {
        name: "urgency",
        patterns: [/nu/i, /onmiddellijk/i, /beperkt/i, /laatste kans/i],
        severity: 7,
        description: "Urgency tactics"
      },
      {
        name: "authority",
        patterns: [/beste/i, /top/i, /leider/i, /nummer één/i],
        severity: 6,
        description: "Authority claims"
      },
      {
        name: "promotional",
        patterns: [/gemakkelijk/i, /simpel/i, /snel/i, /zonder moeite/i],
        severity: 5,
        description: "Promotional phrasing"
      }
    ]
  },
  "nl-BE": {
    regulator: "FSMA",
    disclaimer: "Financiële investeringen brengen risico's met zich mee, inclusief verlies van kapitaal. Raadpleeg een financieel adviseur.",
    toneGuidelines: "Neutral and informative. Avoid guarantees.",
    additionalConstraints: ["No performance projections", "Clear disclaimers"],
    categories: [
      {
        name: "guarantees",
        patterns: [/gegarandeerd/i, /veilig/i, /risicovrij/i, /100% veilig/i],
        severity: 9,
        description: "Guarantees"
      },
      {
        name: "urgency",
        patterns: [/nu/i, /onmiddellijk/i, /beperkt/i, /laatste kans/i],
        severity: 7,
        description: "Urgency"
      },
      {
        name: "authority",
        patterns: [/beste/i, /top/i, /leider/i, /nummer één/i],
        severity: 6,
        description: "Authority"
      },
      {
        name: "promotional",
        patterns: [/gemakkelijk/i, /simpel/i, /snel/i, /zonder moeite/i],
        severity: 5,
        description: "Promotional"
      }
    ]
  },
  "fr-BE": {
    regulator: "FSMA",
    disclaimer: "Les investissements financiers comportent des risques, y compris la perte du capital. Consultez un conseiller financier.",
    toneGuidelines: "Professional and neutral. No speculative language.",
    additionalConstraints: ["No guaranteed returns", "Risk disclosures required"],
    categories: [
      {
        name: "guarantees",
        patterns: [/garanti/i, /sûr/i, /sans risque/i, /100% sûr/i],
        severity: 9,
        description: "Guarantees"
      },
      {
        name: "urgency",
        patterns: [/immédiatement/i, /maintenant/i, /limité/i, /dernière chance/i],
        severity: 7,
        description: "Urgency"
      },
      {
        name: "authority",
        patterns: [/meilleur/i, /top/i, /leader/i, /numéro un/i],
        severity: 6,
        description: "Authority"
      },
      {
        name: "promotional",
        patterns: [/facile/i, /simple/i, /rapide/i, /sans effort/i],
        severity: 5,
        description: "Promotional"
      }
    ]
  },
  "es-ES": {
    regulator: "CNMV",
    disclaimer: "Las inversiones financieras conllevan riesgos, incluyendo la pérdida del capital. Consulte a un asesor financiero.",
    toneGuidelines: "Informational and cautious. Avoid guarantees.",
    additionalConstraints: ["No future projections", "Risk warnings mandatory"],
    categories: [
      {
        name: "guarantees",
        patterns: [/garantizado/i, /seguro/i, /sin riesgo/i, /100% seguro/i],
        severity: 9,
        description: "Guarantees"
      },
      {
        name: "urgency",
        patterns: [/inmediatamente/i, /ahora/i, /limitado/i, /última oportunidad/i],
        severity: 7,
        description: "Urgency"
      },
      {
        name: "authority",
        patterns: [/mejor/i, /top/i, /líder/i, /número uno/i],
        severity: 6,
        description: "Authority"
      },
      {
        name: "promotional",
        patterns: [/fácil/i, /simple/i, /rápido/i, /sin esfuerzo/i],
        severity: 5,
        description: "Promotional"
      }
    ]
  },
  "en-GB": {
    regulator: "FCA",
    disclaimer: "Financial investments carry risk, including the potential loss of capital. Seek independent financial advice if unsure.",
    toneGuidelines: "Factual, balanced, and clear. Avoid exaggeration and misleading claims.",
    additionalConstraints: ["No guaranteed returns", "Risk warnings must be prominent", "Past performance disclaimers required"],
    categories: [
      {
        name: "guarantees",
        patterns: [/guaranteed/i, /safe/i, /risk-free/i, /100% secure/i, /no risk/i],
        severity: 9,
        description: "Implied or explicit guarantees of returns or safety"
      },
      {
        name: "urgency",
        patterns: [/immediately/i, /\bnow\b/i, /limited/i, /last chance/i, /act fast/i, /don't miss/i, /hurry/i],
        severity: 7,
        description: "Creating false urgency or scarcity"
      },
      {
        name: "authority",
        patterns: [/\bbest\b/i, /\btop\b/i, /leader/i, /number one/i, /award-winning/i],
        severity: 6,
        description: "False authority or superiority claims"
      },
      {
        name: "promotional",
        patterns: [/\beasy\b/i, /\bsimple\b/i, /\bfast\b/i, /effortless/i, /no-brainer/i],
        severity: 5,
        description: "Overly promotional or simplified claims"
      }
    ]
  }
};

export function getRegulatorRules(locale: LocaleCode): RegulatorRules {
  return regulatorRules[locale] || regulatorRules["it-IT"]; // fallback
}

export function validateRuleBased(text: string, locale: LocaleCode): { issues: Array<{ category: string; severity: number; description: string; matches: string[] }>; score: number } {
  const rules = getRegulatorRules(locale);
  const issues: Array<{ category: string; severity: number; description: string; matches: string[] }> = [];
  let totalSeverity = 0;

  for (const category of rules.categories) {
    const matches: string[] = [];
    for (const pattern of category.patterns) {
      const regex = typeof pattern === 'string' ? new RegExp(pattern, 'gi') : pattern;
      const found = text.match(regex);
      if (found) {
        matches.push(...found);
      }
    }
    if (matches.length > 0) {
      issues.push({ category: category.name, severity: category.severity, description: category.description, matches });
      totalSeverity += category.severity * matches.length;
    }
  }

  const score = Math.max(0, 10 - totalSeverity / 10); // Scale to 0-10, higher is better
  return { issues, score };
}

export async function validateSemantic(text: string, locale: LocaleCode): Promise<{ compliant: boolean; issues: string[]; confidence: number }> {
  if (!process.env.OPENAI_API_KEY) {
    return { compliant: true, issues: [], confidence: 0.5 };
  }

  const rules = getRegulatorRules(locale);
  const prompt = `Analyze the following marketing text for regulatory compliance in ${locale} (${rules.regulator}).

Text: "${text}"

Check for:
- Implied guarantees or reduced-risk claims (even indirect)
- Persuasive or promotional tone
- Urgency tactics
- False authority claims
- Any misleading financial claims

Respond with JSON: {"compliant": boolean, "issues": ["issue1", "issue2"], "confidence": 0.0-1.0}`;

  try {
    const response = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages: [{ role: "user", content: prompt }],
      temperature: 0.1,
      max_tokens: 300
    });

    const raw = response.choices?.[0]?.message?.content ?? "{}";
    const parsed = JSON.parse(raw);
    return {
      compliant: parsed.compliant ?? true,
      issues: parsed.issues ?? [],
      confidence: parsed.confidence ?? 0.5
    };
  } catch (error) {
    console.error("Semantic validation error:", error);
    return { compliant: true, issues: [], confidence: 0.5 };
  }
}

export async function rewriteNonCompliant(text: string, issues: string[], locale: LocaleCode): Promise<string> {
  if (!process.env.OPENAI_API_KEY || issues.length === 0) {
    return text;
  }

  try {
    // Use semantic rewrite for better compliance understanding
    const { rewriteForCompliance } = await import('./semantic-compliance.js');
    const result = await rewriteForCompliance(text, issues, locale);
    return result.rewrittenText;
  } catch (error) {
    console.error("Semantic rewrite error:", error);
    // Fallback to basic disclaimer addition if semantic rewrite fails
    return addDisclaimer(text, locale);
  }
}

export async function validateCompliance(text: string, locale: LocaleCode): Promise<ComplianceDecisionResult & { compliant: boolean; suggestions: string[] }> {
  const decision = await makeComplianceDecision(text, locale);

  return {
    ...decision,
    compliant: decision.status === 'SAFE',
    suggestions: decision.issues.map(issue => `Address: ${issue}`)
  };
}

export function addDisclaimer(text: string, locale: LocaleCode): string {
  const rules = getRegulatorRules(locale);
  return `${text}\n\n${rules.disclaimer}`;
}
