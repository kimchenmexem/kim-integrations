import { LocaleCode } from "@mexem/shared";

export interface JurisdictionRules {
  locale: LocaleCode;
  regulator: string;
  language: string;
  prohibited: string[];
  conditionalRequirements: string[];
  compliantFeatures: string[];
  riskWarning: string;
  pastPerformanceDisclaimer: string;
  regulatorNotes: string;
}

const RULES: Record<LocaleCode, JurisdictionRules> = {
  "it-IT": {
    locale: "it-IT",
    regulator: "ESMA / CySEC",
    language: "Italian",
    prohibited: [
      "Guaranteed returns or profits: 'rendimento garantito', 'profitto assicurato', 'guadagno certo'",
      "Risk-free claims: 'senza rischio', 'completamente sicuro', 'capitale protetto'",
      "Urgency/scarcity: 'offerta limitata', 'agisci ora', 'non perdere questa opportunità'",
      "Unsupported superlatives: 'il migliore', 'straordinario', 'rivoluzionario'",
      "Wealth outcome promises: 'libertà finanziaria', 'diventa ricco', 'costruisci ricchezza'",
      "Social proof implying success: 'migliaia di trader di successo stanno guadagnando'",
      "Investment advice or timing: 'dovresti investire adesso', 'è il momento giusto per investire'",
    ],
    conditionalRequirements: [
      "If mentioning returns, profits, or performance outcomes: must include capital-loss risk warning",
      "If referencing past performance: must state 'I risultati passati non sono indicativi dei risultati futuri'",
      "If mentioning leverage: must prominently state the risk of rapid capital loss",
    ],
    compliantFeatures: [
      "'Senza commissioni', 'commissioni zero', 'EUR0 commissioni' — pricing model, NOT investment outcome",
      "'Prezzi trasparenti', 'costi chiari' — fee transparency, product feature",
      "'Piattaforma professionale', 'strumenti avanzati' — platform capability",
      "'Oltre 70 ETP', 'accesso a mercati globali' — product catalogue description",
      "Brand names: MEXEM, WisdomTree — always compliant",
    ],
    riskWarning: "Gli investimenti comportano rischi, inclusa la possibile perdita del capitale investito.",
    pastPerformanceDisclaimer: "I risultati passati non sono indicativi dei risultati futuri.",
    regulatorNotes: "ESMA sets the EU baseline (MiFID II Art. 24): communications must be fair, clear, and not misleading. Benefits must be balanced with risks. CySEC (MEXEM licensing regulator) additionally prohibits creating unrealistic expectations about investment returns.",
  },

  "fr-FR": {
    locale: "fr-FR",
    regulator: "AMF",
    language: "French",
    prohibited: [
      "Guaranteed returns: 'rendement garanti', 'profit assuré', 'gains certains'",
      "Risk-free claims: 'sans risque', 'investissement sûr', 'capital protégé'",
      "Urgency tactics: 'offre limitée', 'agissez maintenant', 'ne manquez pas'",
      "Unsupported superlatives: 'le meilleur', 'extraordinaire', 'révolutionnaire'",
      "Wealth outcome promises: 'liberté financière', 'devenez riche', 'construisez votre fortune'",
      "Social proof implying success: 'des milliers de traders gagnent avec nous'",
      "Investment advice: 'vous devriez investir', 'c est le bon moment pour investir'",
      "Comparative advertising without substantiated data",
    ],
    conditionalRequirements: [
      "If mentioning returns or performance: must immediately balance with capital-loss risk warning",
      "If referencing past performance: must state 'Les performances passées ne préjugent pas des performances futures'",
      "Must not present product as suitable for all investors without qualification",
      "AMF: every benefit claim must be accompanied by corresponding risk disclosure",
    ],
    compliantFeatures: [
      "'Sans commission', 'frais zéro', 'EUR0 de frais' — pricing model, NOT investment return",
      "'Tarification transparente', 'frais clairs' — fee transparency feature",
      "'Plateforme professionnelle', 'outils avancés' — platform capability",
      "'Plus de 70 ETPs', 'accès aux marchés mondiaux' — product catalogue",
    ],
    riskWarning: "Les investissements comportent des risques, y compris la perte partielle ou totale du capital investi.",
    pastPerformanceDisclaimer: "Les performances passées ne préjugent pas des performances futures.",
    regulatorNotes: "AMF (Autorité des Marchés Financiers) is one of Europe's strictest marketing regulators. Article 314-10 CMF: communications must be balanced — every benefit claim must be accompanied by risk disclosure. AMF Position DOC-2013-12 mandates past-performance disclaimers.",
  },

  "nl-NL": {
    locale: "nl-NL",
    regulator: "AFM",
    language: "Dutch",
    prohibited: [
      "Guaranteed returns: 'gegarandeerd rendement', 'zeker winst', 'gegarandeerde winst'",
      "Risk-free claims: 'risicovrij', 'veilig beleggen', 'uw kapitaal is beschermd'",
      "Urgency: 'beperkt aanbod', 'handel nu', 'mis het niet'",
      "Unsupported superlatives: 'de beste', 'uitzonderlijk', 'revolutionair'",
      "Wealth promises: 'financiële vrijheid', 'word rijk', 'bouw vermogen op'",
      "Social proof implying success: 'duizenden succesvolle beleggers verdienen met ons'",
      "Investment advice: 'u zou nu moeten beleggen', 'dit is het juiste moment'",
    ],
    conditionalRequirements: [
      "If mentioning returns or performance: must include capital-loss risk warning",
      "If referencing past performance: must state 'In het verleden behaalde resultaten bieden geen garantie voor de toekomst'",
      "Fee disclosures must be accurate and not downplay total costs",
      "Complex products must include a complexity warning",
    ],
    compliantFeatures: [
      "'Zonder commissie', 'nul commissie', 'EUR0 commissie' — pricing model only",
      "'Transparante prijzen', 'duidelijke kosten' — fee transparency feature",
      "'Professioneel platform', 'geavanceerde tools' — platform capability",
      "'Meer dan 70 ETPs', 'toegang tot wereldwijde markten' — product catalogue",
    ],
    riskWarning: "Beleggen brengt risico's met zich mee. U kunt (een deel van) uw inleg verliezen.",
    pastPerformanceDisclaimer: "In het verleden behaalde resultaten bieden geen garantie voor de toekomst.",
    regulatorNotes: "AFM (Autoriteit Financiële Markten) enforces Wft Art. 4:19: all investment advertising must be balanced, clear, and not misleading. AFM specifically targets misleading performance comparisons and partial fee disclosures. Fines up to EUR4M for non-compliant marketing.",
  },

  "nl-BE": {
    locale: "nl-BE",
    regulator: "FSMA",
    language: "Dutch (Belgian)",
    prohibited: [
      "Guaranteed returns: 'gegarandeerd rendement', 'zeker winst'",
      "Risk-free claims: 'risicovrij', 'veilig beleggen', 'kapitaalbescherming'",
      "Urgency/pressure: 'beperkt aanbod', 'handel nu', 'niet missen'",
      "Unsupported superlatives: 'de beste', 'uitzonderlijk', 'uniek'",
      "Wealth promises: 'financiële vrijheid', 'bouw uw vermogen'",
      "Investment advice framing: 'u zou nu moeten beleggen'",
    ],
    conditionalRequirements: [
      "If mentioning returns or performance: must include capital-at-risk warning",
      "If referencing past results: must disclaim they are no guarantee of future performance",
      "Ads must clearly identify the regulated entity (FSMA requirement)",
      "Must not imply FSMA endorsement of the product or strategy",
    ],
    compliantFeatures: [
      "'Zonder commissie', 'nul commissie' — pricing model",
      "'Transparante tarieven' — fee transparency",
      "'Professioneel handelsplatform' — platform feature",
      "'Meer dan 70 ETPs' — product catalogue",
    ],
    riskWarning: "Beleggen brengt risico's met zich mee, inclusief het risico uw volledige inleg te verliezen.",
    pastPerformanceDisclaimer: "Resultaten uit het verleden zijn geen betrouwbare indicator voor toekomstige resultaten.",
    regulatorNotes: "FSMA applies Royal Decree of 25 April 2014 and Circular 2018/02 for digital marketing of investment products. Must display regulated entity details in all ads. FSMA is particularly strict on digital and social media advertising.",
  },

  "fr-BE": {
    locale: "fr-BE",
    regulator: "FSMA",
    language: "French (Belgian)",
    prohibited: [
      "Guaranteed returns: 'rendement garanti', 'profit assuré', 'gains certains'",
      "Risk-free claims: 'sans risque', 'capital protégé', 'investissement sûr'",
      "Urgency tactics: 'offre limitée', 'agissez maintenant'",
      "Unsupported superlatives: 'le meilleur', 'exceptionnel', 'révolutionnaire'",
      "Wealth promises: 'liberté financière', 'devenez riche'",
      "Investment advice framing: 'vous devriez investir maintenant'",
    ],
    conditionalRequirements: [
      "If mentioning returns or performance: must include capital-at-risk warning",
      "If referencing past results: must include past-performance disclaimer",
      "Must identify the regulated entity in advertising (FSMA requirement)",
      "Must not imply FSMA endorsement",
    ],
    compliantFeatures: [
      "'Sans commission', 'zéro frais' — pricing model",
      "'Tarification transparente' — fee transparency",
      "'Plateforme professionnelle' — platform feature",
      "'Plus de 70 ETPs' — product catalogue",
    ],
    riskWarning: "Investir comporte des risques, y compris la perte possible de tout le capital investi.",
    pastPerformanceDisclaimer: "Les performances passées ne constituent pas un indicateur fiable des résultats futurs.",
    regulatorNotes: "FSMA applies Arrêté Royal du 25 avril 2014 and Circulaire 2018/02. Rules align closely with AMF but under Belgian law. All benefit claims must be balanced with risk disclosure.",
  },

  "es-ES": {
    locale: "es-ES",
    regulator: "CNMV",
    language: "Spanish",
    prohibited: [
      "Guaranteed returns: 'rentabilidad garantizada', 'ganancias aseguradas', 'beneficios garantizados'",
      "Risk-free claims: 'sin riesgo', 'inversión segura', 'capital protegido'",
      "Urgency tactics: 'oferta limitada', 'actúa ahora', 'no te lo pierdas'",
      "Unsupported superlatives: 'el mejor', 'extraordinario', 'revolucionario'",
      "Wealth promises: 'libertad financiera', 'hazte rico', 'construye tu patrimonio'",
      "Social proof of success: 'miles de inversores exitosos ganan con nosotros'",
      "Investment advice: 'deberías invertir ahora', 'es el momento adecuado para invertir'",
    ],
    conditionalRequirements: [
      "If mentioning returns, performance, or investment outcomes: must include risk warning",
      "If referencing past performance: must use CNMV verbatim: 'Los resultados pasados no son indicativos de resultados futuros'",
      "CNMV Circular 1/2019: risk warnings must be as prominent as benefit claims (same font size/visibility)",
      "Must clearly identify the investment firm in all advertising",
      "Must not suggest the product is suitable for all investor profiles",
    ],
    compliantFeatures: [
      "'Sin comisiones', 'cero comisiones', 'EUR0 comisiones' — pricing model, NOT investment return",
      "'Precios transparentes', 'tarifas claras' — fee transparency feature",
      "'Plataforma profesional', 'herramientas avanzadas' — platform capability",
      "'Más de 70 ETPs', 'acceso a mercados globales' — product catalogue",
    ],
    riskWarning: "Invertir conlleva riesgos, incluida la posible pérdida del capital invertido.",
    pastPerformanceDisclaimer: "Los resultados pasados no son indicativos de resultados futuros.",
    regulatorNotes: "CNMV Circular 1/2019: risk warnings must be as prominent as benefit claims. Testimonials implying guaranteed outcomes are prohibited. Must disclose product type (ETP, fund, etc.) in advertising.",
  },

  "en-GB": {
    locale: "en-GB",
    regulator: "FCA",
    language: "English (UK)",
    prohibited: [
      "Guaranteed returns: 'guaranteed returns', 'assured profits', 'certain gains'",
      "Risk-free claims: 'risk-free', 'no risk', '100% safe', 'completely secure'",
      "Urgency/scarcity: 'limited time', 'act now', 'don't miss out', 'hurry', 'last chance'",
      "Unsupported superlatives: 'the best', 'number one', 'award-winning', 'top platform'",
      "Wealth outcome promises: 'financial freedom', 'get rich', 'build wealth fast'",
      "Social proof implying success: 'thousands of traders are profiting with us'",
      "Investment advice: 'you should invest now', 'this is the right time to buy'",
    ],
    conditionalRequirements: [
      "If mentioning returns or performance: must include capital-at-risk warning",
      "If referencing past performance: must state 'Past performance is not a reliable indicator of future results'",
      "FCA COBS 4.2: communications must be fair, clear, and not misleading",
      "Risk warnings must be as prominent as benefit claims",
      "Must not suggest suitability for all investor profiles without qualification",
    ],
    compliantFeatures: [
      "'Commission-free', 'zero commission', 'EUR0 commission' — pricing model, NOT investment return",
      "'Transparent pricing', 'clear fees' — fee transparency feature",
      "'Professional platform', 'advanced tools' — platform capability",
      "'Over 70 ETPs', 'access to global markets' — product catalogue description",
      "Brand names: MEXEM, WisdomTree — always compliant",
    ],
    riskWarning: "Investments carry risk, including the potential loss of capital invested.",
    pastPerformanceDisclaimer: "Past performance is not a reliable indicator of future results.",
    regulatorNotes: "FCA (Financial Conduct Authority) COBS 4.2: financial promotions must be fair, clear, and not misleading. Benefits must be balanced with risks. FCA has specific rules on past-performance presentation and prominence of risk warnings. Fines for non-compliant promotions can be substantial.",
  },
};

export function getJurisdictionRules(locale: LocaleCode): JurisdictionRules {
  return RULES[locale] ?? RULES["it-IT"];
}

/**
 * Build the rules block for LLM validator prompts.
 *
 * If a published bundle exists for this locale, uses its compiled promptContext
 * (which was reviewed and approved via the compliance workflow).
 * Falls back to the legacy hardcoded rules otherwise.
 *
 * @param bundlePromptContext - pass `bundle.content.promptContext` if a bundle was loaded.
 */
export function buildRulesBlock(locale: LocaleCode, bundlePromptContext?: string): string {
  // If a bundle is providing prompt context, wrap it in the same structural format
  // the validators expect, but use the curated content.
  if (bundlePromptContext) {
    const r = getJurisdictionRules(locale);
    return `JURISDICTION: ${r.locale} — Regulator: ${r.regulator} — Language: ${r.language}

APPROVED COMPLIANCE RULES (from published bundle):
${bundlePromptContext}

REQUIRED RISK WARNING (only when return/performance claims are present):
"${r.riskWarning}"

PAST PERFORMANCE DISCLAIMER (only when past results are referenced):
"${r.pastPerformanceDisclaimer}"

COMPLIANT PRODUCT FEATURES (do NOT flag these):
${r.compliantFeatures.map(f => `• ${f}`).join("\n")}

REGULATOR NOTES:
${r.regulatorNotes}`.trim();
  }

  // Legacy fallback — hardcoded rules
  const r = getJurisdictionRules(locale);
  return `JURISDICTION: ${r.locale} — Regulator: ${r.regulator} — Language: ${r.language}

HARD PROHIBITIONS (any of these = NON-COMPLIANT):
${r.prohibited.map(p => `• ${p}`).join("\n")}

CONDITIONAL REQUIREMENTS:
${r.conditionalRequirements.map(c => `• ${c}`).join("\n")}

COMPLIANT PRODUCT FEATURES (do NOT flag these):
${r.compliantFeatures.map(f => `• ${f}`).join("\n")}

REQUIRED RISK WARNING (only when return/performance claims are present):
"${r.riskWarning}"

PAST PERFORMANCE DISCLAIMER (only when past results are referenced):
"${r.pastPerformanceDisclaimer}"

REGULATOR NOTES:
${r.regulatorNotes}`.trim();
}
