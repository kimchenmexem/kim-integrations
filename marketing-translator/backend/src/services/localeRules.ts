import { LocaleCode } from "@mexem/shared";

// Words/phrases that trigger compliance violations per locale — the translator MUST avoid these
const COMPLIANCE_FORBIDDEN: Record<LocaleCode, string[]> = {
  "it-IT": ["garantito", "sicuro", "senza rischio", "subito", "ora", "limitato", "ultima occasione", "migliore", "top", "leader", "numero uno", "facile", "semplice", "veloce", "senza sforzo"],
  "fr-FR": ["garanti", "sûr", "sans risque", "immédiatement", "maintenant", "limité", "dernière chance", "meilleur", "top", "leader", "numéro un", "facile", "simple", "rapide", "sans effort"],
  "nl-NL": ["gegarandeerd", "veilig", "risicovrij", "nu", "onmiddellijk", "beperkt", "laatste kans", "beste", "top", "leider", "nummer één", "gemakkelijk", "simpel", "snel", "zonder moeite"],
  "nl-BE": ["gegarandeerd", "veilig", "risicovrij", "nu", "onmiddellijk", "beperkt", "laatste kans", "beste", "top", "leider", "nummer één", "gemakkelijk", "simpel", "snel", "zonder moeite"],
  "fr-BE": ["garanti", "sûr", "sans risque", "immédiatement", "maintenant", "limité", "dernière chance", "meilleur", "top", "leader", "numéro un", "facile", "simple", "rapide", "sans effort"],
  "es-ES": ["garantizado", "seguro", "sin riesgo", "inmediatamente", "ahora", "limitado", "última oportunidad", "mejor", "top", "líder", "número uno", "fácil", "simple", "rápido", "sin esfuerzo"],
  "en-GB": ["guaranteed", "safe", "risk-free", "immediately", "now", "limited", "last chance", "best", "top", "leader", "number one", "easy", "simple", "fast", "effortless"],
};

export function getComplianceForbiddenWords(locale: LocaleCode): string[] {
  return COMPLIANCE_FORBIDDEN[locale] ?? [];
}

export function getLocaleRules(locale: LocaleCode): string {
  const rules: Record<LocaleCode, string> = {
    "it-IT": "Use informal Italian (the 'tu' form, second-person singular) when addressing retail readers in Italy — this matches the modern Italian fintech / retail-broker convention. Prefer concise, direct phrasing. Keep brand terms like MEXEM unchanged.",
    "fr-FR": "Use standard French for France with a professional marketing tone. Avoid overly casual slang and keep financial terms accurate and compliant.",
    "nl-NL": "Use Dutch for the Netherlands with direct, clear phrasing. Keep marketing focused on trading empowerment, avoid colloquialisms specific to Belgium.",
    "nl-BE": "Use Dutch for Belgium with a more neutral, locally aware tone. Avoid Netherlands-specific expressions and use Belgian Dutch conventions.",
    "fr-BE": "Use French for Belgium with Belgian conventions and a slightly warmer tone. Avoid France-specific idioms and keep compliance language accurate.",
    "es-ES": "Use Castilian Spanish for Spain with natural marketing phrasing. Keep regulatory language clear and factual.",
    "en-GB": "Use British English spelling and conventions (e.g. 'capitalise', 'colour', 'programme'). Maintain a professional, FCA-compliant tone. Keep language factual and avoid promotional exaggeration."
  };

  return rules[locale] ?? "Use the target locale conventions and keep marketing copy natural, compliant, and aligned with brand tone.";
}
