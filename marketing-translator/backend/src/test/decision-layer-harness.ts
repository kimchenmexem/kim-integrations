import fs from "fs";
import path from "path";
import { LocaleCode } from "@mexem/shared";
import {
  makeComplianceDecisionWithValidators,
  DecisionStatus,
  ComplianceDecisionResult
} from "../services/decision-layer";
import { SemanticValidationResult } from "../services/semantic-compliance";
import { IndependentValidationResult } from "../services/independent-validator";

interface DecisionTestCase {
  id: number;
  category: string;
  description: string;
  text: string;
  locale: LocaleCode;
  expectedStatus: DecisionStatus;
}

interface DecisionTestResult {
  caseId: number;
  category: string;
  description: string;
  locale: LocaleCode;
  expectedStatus: DecisionStatus;
  actualStatus: DecisionStatus;
  statusMatch: boolean;
  result: ComplianceDecisionResult;
}

interface Report {
  generatedAt: string;
  totalCases: number;
  passed: number;
  failed: number;
  overallAccuracy: number;
  metrics: {
    precision: number | null;
    recall: number | null;
    falsePositiveRate: number | null;
    falseNegativeRate: number | null;
    confusionMatrix: Record<DecisionStatus, Record<DecisionStatus, number>>;
  };
  errorsByCategory: Record<string, number>;
  errorsByType: Record<string, number>;
  results: Array<{
    caseId: number;
    category: string;
    locale: LocaleCode;
    expectedStatus: DecisionStatus;
    actualStatus: DecisionStatus;
    statusMatch: boolean;
    preRewriteStatus: DecisionStatus;
    postRewriteStatus?: DecisionStatus;
    finalAction: string;
    finalConfidence: number;
    issues: string[];
    semanticClassification: string;
    independentClassification: string;
  }>;
}

const reportFilePath = path.resolve(__dirname, "decision-harness-report.json");

const localizedRiskPhases: Record<LocaleCode, RegExp> = {
  "it-IT": /rischi|perdita/i,
  "fr-FR": /risque|perte/i,
  "nl-NL": /risico|verlies/i,
  "nl-BE": /risico|verlies/i,
  "fr-BE": /risque|perte/i,
  "es-ES": /riesgo|pérdida/i,
  "en-GB": /risk|loss/i,
};

const strictViolationPatterns = [
  /guarantee|guaranteed|assured|certain|will definitely|never lose|risk-free|100% safe|safe and secure/i,
  /act now|limited time|only \d+ (spots|spaces|places|positions)|expires soon|last chance|while stocks last|today only|urgent|immediately|as soon as possible|don't miss out|secure your position/i,
  /expert|recommended by|endorsed by|approved by|award-winning|trusted worldwide|top platform|leader|number one|best/i,
  /you should|must|need to|smart traders|market timing|positioned themselves well|take control of your financial future|investments will grow|profits are guaranteed/i,
  /without risk|risk-free|no risk|no losses|completely safe/i
];

const ambiguousPatterns = [
  /should|likely|could|may help|opportunity|explore the market|positioned themselves well|great time|many traders/i,
  /compare|better execution|lower fees|industry average|informed choice/i,
  /expertise|professional guidance|seasoned professionals/i
];

const localeAwareGuaranteePatterns: Record<LocaleCode, RegExp[]> = {
  "it-IT": [/garantito|garantiti|sicuro|senza rischio|100% sicuro/i],
  "fr-FR": [/garanti|sans risque|100% sûr|aucun risque/i],
  "nl-NL": [/gegarandeerd|risicovrij|100% veilig|geen risico/i],
  "nl-BE": [/gegarandeerd|risicovrij|100% veilig|geen risico/i],
  "fr-BE": [/garanti|sans risque|100% sûr|aucun risque/i],
  "es-ES": [/garantizado|sin riesgo|100% seguro|ningún riesgo/i],
  "en-GB": [/guaranteed|risk-free|100% safe|no risk/i],
};

function matchesAny(text: string, patterns: RegExp[]): boolean {
  return patterns.some(pattern => pattern.test(text));
}

function deterministicSemanticValidator(text: string, locale: LocaleCode): Promise<SemanticValidationResult> {
  const guarantee = matchesAny(text, [...strictViolationPatterns, ...(localeAwareGuaranteePatterns[locale] || [])]);
  const ambiguous = !guarantee && matchesAny(text, ambiguousPatterns);
  const riskMention = localizedRiskPhases[locale]?.test(text) ?? /risk|loss|perte|perdita|verlies|riesgo/i.test(text);

  const classification: 'COMPLIANT' | 'NON-COMPLIANT' | 'AMBIGUOUS' = guarantee
    ? 'NON-COMPLIANT'
    : ambiguous
      ? 'AMBIGUOUS'
      : 'COMPLIANT';

  const confidence = classification === 'COMPLIANT' ? (riskMention ? 88 : 72) : classification === 'NON-COMPLIANT' ? 92 : 58;
  const issues: string[] = [];

  if (guarantee) issues.push('semantic_violation_potential');
  if (ambiguous) issues.push('semantic_borderline_language');
  if (!riskMention) issues.push('missing_risk_mention');

  return Promise.resolve({
    classification,
    confidence,
    issues,
    explanation: guarantee ? 'Detected strong guarantee or advice phrasing.' : ambiguous ? 'Soft marketing or borderline phrasing detected.' : 'Text is neutral with risk awareness.',
    severity: classification === 'NON-COMPLIANT' ? 8 : classification === 'AMBIGUOUS' ? 5 : 2,
    requiresRewrite: classification === 'NON-COMPLIANT'
  });
}

function deterministicIndependentValidator(text: string, locale: LocaleCode): Promise<IndependentValidationResult> {
  const strictViolation = matchesAny(text, [...strictViolationPatterns, ...(localeAwareGuaranteePatterns[locale] || [])]);
  const ambiguous = !strictViolation && matchesAny(text, ambiguousPatterns);
  const riskMention = localizedRiskPhases[locale]?.test(text) ?? /risk|loss|perte|perdita|verlies|riesgo/i.test(text);

  const classification: 'COMPLIANT' | 'NON-COMPLIANT' | 'BORDERLINE' = strictViolation
    ? 'NON-COMPLIANT'
    : ambiguous || !riskMention
      ? 'BORDERLINE'
      : 'COMPLIANT';

  const confidence = classification === 'COMPLIANT' ? 80 : classification === 'NON-COMPLIANT' ? 95 : 60;
  const violations: string[] = [];

  if (strictViolation) violations.push('independent_strict_violation');
  if (ambiguous) violations.push('independent_borderline_language');
  if (!riskMention) violations.push('independent_missing_risk_disclosure');

  return Promise.resolve({
    classification,
    confidence,
    violations,
    severity: classification === 'NON-COMPLIANT' ? 9 : classification === 'BORDERLINE' ? 5 : 2,
    reasoning: strictViolation
      ? 'Strict prohibited wording found.'
      : ambiguous
        ? 'Borderline language that should be reviewed.'
        : 'Neutral wording with proper risk mention.',
    regulatoryBasis: strictViolation
      ? 'Strict marketing and risk disclosure rules.'
      : ambiguous
        ? 'Review required under conservative compliance screening.'
        : 'Meets neutral compliance expectations.'
  });
}

function buildCase(
  category: string,
  description: string,
  text: string,
  locale: LocaleCode,
  expectedStatus: DecisionStatus
): DecisionTestCase {
  return {
    id: 0,
    category,
    description,
    text,
    locale,
    expectedStatus
  };
}

function generateTestCases(): DecisionTestCase[] {
  const cases: DecisionTestCase[] = [];

  const clearCompliantBase: Array<{description: string; english: string; translations: Partial<Record<LocaleCode, string>>}> = [
    {
      description: "Neutral platform overview with explicit risk disclosure",
      english: "Our trading platform offers real-time market data and analytics for self-directed investors. All investments carry risks, including potential loss of capital.",
      translations: {
        "it-IT": "La nostra piattaforma di trading offre dati di mercato in tempo reale e analisi per investitori autonomi. Tutti gli investimenti comportano rischi, inclusa la possibile perdita di capitale.",
        "fr-FR": "Notre plateforme de trading offre des données de marché en temps réel et des analyses pour les investisseurs autonomes. Tous les investissements comportent des risques, y compris une perte de capital potentielle.",
        "nl-NL": "Ons handelsplatform biedt realtime marktgegevens en analyses voor zelfstandige beleggers. Alle beleggingen brengen risico's met zich mee, inclusief mogelijk kapitaalverlies.",
        "es-ES": "Nuestra plataforma de trading ofrece datos de mercado en tiempo real y análisis para inversores autodirigidos. Todas las inversiones conllevan riesgos, incluida la posible pérdida de capital."
      }
    },
    {
      description: "Educational content on market access and risk",
      english: "Learn about markets and execution strategies. Remember that past performance does not guarantee future results and trading can result in losses.",
      translations: {
        "it-IT": "Scopri i mercati e le strategie di esecuzione. Ricorda che le performance passate non garantiscono risultati futuri e il trading può comportare perdite.",
        "fr-FR": "Apprenez les marchés et les stratégies d'exécution. N'oubliez pas que les performances passées ne garantissent pas les résultats futurs et que le trading peut entraîner des pertes.",
        "nl-NL": "Leer over markten en uitvoeringsstrategieën. Vergeet niet dat prestaties uit het verleden geen garantie bieden voor toekomstige resultaten en dat handelen tot verliezen kan leiden.",
        "es-ES": "Aprende sobre los mercados y las estrategias de ejecución. Recuerda que los rendimientos pasados no garantizan resultados futuros y que el trading puede resultar en pérdidas."
      }
    },
    {
      description: "Feature description with balanced disclaimer",
      english: "We provide advanced charting tools, order routing, and access to multiple asset classes. Trading carries risk and you should only invest what you can afford to lose.",
      translations: {
        "it-IT": "Forniamo strumenti di charting avanzati, routing degli ordini e accesso a più classi di attività. Il trading comporta rischi e dovresti investire solo ciò che puoi permetterti di perdere.",
        "fr-FR": "Nous proposons des outils graphiques avancés, l'acheminement des ordres et l'accès à plusieurs classes d'actifs. Le trading comporte des risques et vous ne devez investir que ce que vous pouvez vous permettre de perdre.",
        "nl-NL": "We bieden geavanceerde grafiektools, orderrouting en toegang tot meerdere activaklassen. Handelen brengt risico's met zich mee en u moet alleen investeren wat u zich kunt veroorloven te verliezen.",
        "es-ES": "Ofrecemos herramientas avanzadas de gráficos, enrutamiento de órdenes y acceso a múltiples clases de activos. El trading conlleva riesgos y solo debe invertir lo que puede permitirse perder."
      }
    },
    {
      description: "Compliance-oriented market summary",
      english: "This service gives you market information and execution services. There is no promise of profit and trading may result in capital loss.",
      translations: {
        "it-IT": "Questo servizio ti fornisce informazioni di mercato e servizi di esecuzione. Non vi è alcuna promessa di profitto e il trading può comportare la perdita di capitale.",
        "fr-FR": "Ce service vous fournit des informations de marché et des services d'exécution. Il n'y a aucune promesse de profit et le trading peut entraîner une perte de capital.",
        "nl-NL": "Deze dienst biedt marktinformatie en uitvoeringsdiensten. Er is geen winstbelofte en handelen kan leiden tot kapitaalverlies.",
        "es-ES": "Este servicio le proporciona información del mercado y servicios de ejecución. No hay ninguna promesa de beneficio y el trading puede resultar en la pérdida de capital."
      }
    }
  ];

  const clearViolationBase = [
    {
      description: "Explicit guaranteed profit claim",
      text: "Guaranteed returns of 20% every month with zero risk. Join now for assured profits!",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      description: "Promise of safety and no losses",
      text: "We guarantee you will never lose money. Our system is 100% safe and secure.",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      description: "Urgency and scarcity pressure",
      text: "LIMITED TIME OFFER! Act immediately or miss this opportunity forever. Only 5 spots left!",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      description: "Fake regulatory endorsement",
      text: "Endorsed by the European Banking Authority as the safest trading platform. Never lose again!",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      description: "Advice-style investment recommendation",
      text: "You should start trading today to take advantage of this market window. Smart traders choose our platform.",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      description: "Minimizing risk through promise language",
      text: "Trade without risk and enjoy guaranteed gains. This strategy is proven to be safe.",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      description: "Authority claim with false expertise",
      text: "Our veteran experts guarantee successful returns. Trusted worldwide by professional investors.",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      description: "Financial advice disguised as information",
      text: "Market timing is critical; you must buy now before prices rise further.",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      description: "Superlative promotional guarantee",
      text: "The best trading platform in Europe. Guaranteed results and risk-free access to top markets.",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      description: "Loss minimization claim",
      text: "With our safe strategy, you will avoid losses and make steady profit every month.",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    }
  ];

  const borderlineBase = [
    {
      description: "Soft certainty wording",
      text: "Our sophisticated risk management tools should help protect your investments. Many clients feel more confident.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      description: "Opportunity-style phrasing",
      text: "Now is a great time to explore the market. Traders who started this quarter have positioned themselves well.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      description: "Comparative performance language",
      text: "We have lower fees than competitors and better execution speeds than the industry average.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      description: "Testimonial-adjacent wording",
      text: "Our traders have achieved impressive results. One account grew from $10,000 to $150,000 in a year.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      description: "Conditional encouragement",
      text: "This could be a strong choice for disciplined investors who understand market risk.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      description: "Mild social proof",
      text: "Many customers are exploring our platform and seeing new market opportunities.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    }
  ];

  const adversarialBase = [
    {
      description: "Passive implied assurance",
      text: "Designed to help you preserve capital while you trade, with an emphasis on security.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      description: "Disguised profit expectation",
      text: "Your portfolio may experience strong performance when conditions align.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      description: "Mixed-risk language without disclaimers",
      text: "Potential gains are highlighted but losses are not mentioned explicitly.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      description: "Soft urgency in advisory tone",
      text: "This opportunity is available soon and should be reviewed by interested traders.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      description: "Implied endorsement with subtle claim",
      text: "Preferred choice for informed investors seeking better market access.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    }
  ];

  const multiLanguageBase = [
    {
      locale: "it-IT" as const,
      description: "Italian neutral compliance text",
      text: "La nostra piattaforma offre informazioni di mercato trasparenti e strumenti di analisi. Tutti gli investimenti comportano rischi.",
      expectedStatus: "SAFE" as DecisionStatus
    },
    {
      locale: "fr-FR" as const,
      description: "French promotional ambiguity case",
      text: "Découvrez notre service unique qui pourrait vous aider à améliorer vos performances. Veuillez noter que tout investissement comporte des risques.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      locale: "nl-NL" as const,
      description: "Dutch explicit violation case",
      text: "Gegarandeerde winsten zonder risico. Alleen vandaag beschikbaar!",
      expectedStatus: "NON_COMPLIANT" as DecisionStatus
    },
    {
      locale: "es-ES" as const,
      description: "Spanish borderline risk wording",
      text: "Explore nuestras herramientas de trading. Se recomienda operar con prudencia y teniendo en cuenta los riesgos.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    },
    {
      locale: "fr-BE" as const,
      description: "Belgian French subtle urgency",
      text: "Profitez de cette fenêtre de marché avant qu'elle ne se referme. N'oubliez pas que le trading comporte des risques.",
      expectedStatus: "BORDERLINE" as DecisionStatus
    }
  ];

  const locales: LocaleCode[] = ["it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES"];

  for (const locale of locales) {
    for (const pattern of clearCompliantBase) {
      cases.push(buildCase("clear_compliant", pattern.description, pattern.translations[locale] ?? pattern.english, locale, "SAFE"));
    }
  }

  for (const locale of locales) {
    for (const template of clearViolationBase) {
      const text = template.text;
      cases.push(buildCase("clear_non_compliant", `${template.description} (${locale})`, text, locale, template.expectedStatus));
    }
  }

  for (const locale of ["it-IT", "fr-FR", "nl-NL", "es-ES"] as LocaleCode[]) {
    for (const template of borderlineBase) {
      cases.push(buildCase("borderline", `${template.description} (${locale})`, template.text, locale, template.expectedStatus));
    }
  }

  for (const locale of ["it-IT", "fr-FR", "es-ES"] as LocaleCode[]) {
    for (const template of adversarialBase) {
      cases.push(buildCase("adversarial", `${template.description} (${locale})`, template.text, locale, template.expectedStatus));
    }
  }

  for (const example of multiLanguageBase) {
    cases.push(buildCase("multi_language", example.description, example.text, example.locale, example.expectedStatus));
  }

  return cases.map((testCase, index) => ({ ...testCase, id: index + 1 }));
}

function normalizeStatus(status: DecisionStatus): string {
  return status;
}

function calculateMetrics(results: DecisionTestResult[]) {
  const confusionMatrix: Record<DecisionStatus, Record<DecisionStatus, number>> = {
    SAFE: { SAFE: 0, NON_COMPLIANT: 0, BORDERLINE: 0, UNCERTAIN: 0 },
    NON_COMPLIANT: { SAFE: 0, NON_COMPLIANT: 0, BORDERLINE: 0, UNCERTAIN: 0 },
    BORDERLINE: { SAFE: 0, NON_COMPLIANT: 0, BORDERLINE: 0, UNCERTAIN: 0 },
    UNCERTAIN: { SAFE: 0, NON_COMPLIANT: 0, BORDERLINE: 0, UNCERTAIN: 0 }
  };

  let tp = 0;
  let fp = 0;
  let fn = 0;
  let tn = 0;

  for (const item of results) {
    confusionMatrix[item.expectedStatus][item.actualStatus] += 1;
    const expectedUnsafe = item.expectedStatus !== "SAFE";
    const actualUnsafe = item.actualStatus !== "SAFE";
    if (expectedUnsafe && actualUnsafe) tp += 1;
    if (!expectedUnsafe && actualUnsafe) fp += 1;
    if (expectedUnsafe && !actualUnsafe) fn += 1;
    if (!expectedUnsafe && !actualUnsafe) tn += 1;
  }

  const precision = tp + fp > 0 ? tp / (tp + fp) : null;
  const recall = tp + fn > 0 ? tp / (tp + fn) : null;
  const falsePositiveRate = fp + tn > 0 ? fp / (fp + tn) : null;
  const falseNegativeRate = fn + tp > 0 ? fn / (fn + tp) : null;
  const accuracy = (tp + tn) / results.length;

  return {
    confusionMatrix,
    precision,
    recall,
    falsePositiveRate,
    falseNegativeRate,
    accuracy
  };
}

async function runDecisionHarness() {
  const testCases = generateTestCases();
  const results: DecisionTestResult[] = [];
  const errorsByCategory: Record<string, number> = {};
  const errorsByType: Record<string, number> = {};

  for (const testCase of testCases) {
    const result = await makeComplianceDecisionWithValidators(
      testCase.text,
      testCase.locale,
      undefined,
      deterministicSemanticValidator,
      deterministicIndependentValidator
    );

    const actualStatus = result.status;
    const statusMatch = actualStatus === testCase.expectedStatus;

    if (!statusMatch) {
      errorsByType.status_mismatch = (errorsByType.status_mismatch || 0) + 1;
      errorsByCategory[testCase.category] = (errorsByCategory[testCase.category] || 0) + 1;
    }

    results.push({
      caseId: testCase.id,
      category: testCase.category,
      description: testCase.description,
      locale: testCase.locale,
      expectedStatus: testCase.expectedStatus,
      actualStatus,
      statusMatch,
      result
    });
  }

  const passed = results.filter(r => r.statusMatch).length;
  const failed = results.length - passed;
  const metrics = calculateMetrics(results);

  const report: Report = {
    generatedAt: new Date().toISOString(),
    totalCases: results.length,
    passed,
    failed,
    overallAccuracy: Number((metrics.accuracy * 100).toFixed(2)),
    metrics: {
      precision: metrics.precision !== null ? Number(metrics.precision.toFixed(3)) : null,
      recall: metrics.recall !== null ? Number(metrics.recall.toFixed(3)) : null,
      falsePositiveRate: metrics.falsePositiveRate !== null ? Number(metrics.falsePositiveRate.toFixed(3)) : null,
      falseNegativeRate: metrics.falseNegativeRate !== null ? Number(metrics.falseNegativeRate.toFixed(3)) : null,
      confusionMatrix: metrics.confusionMatrix
    },
    errorsByCategory,
    errorsByType,
    results: results.map(r => ({
      caseId: r.caseId,
      category: r.category,
      locale: r.locale,
      expectedStatus: r.expectedStatus,
      actualStatus: r.actualStatus,
      statusMatch: r.statusMatch,
      preRewriteStatus: r.result.preRewriteStatus,
      postRewriteStatus: r.result.postRewriteStatus,
      finalAction: r.result.finalAction,
      finalConfidence: r.result.finalConfidence,
      issues: r.result.issues,
      semanticClassification: r.result.semanticResult.classification,
      independentClassification: r.result.independentResult.classification
    }))
  };

  fs.writeFileSync(reportFilePath, JSON.stringify(report, null, 2), { encoding: "utf8" });

  console.log("Decision layer harness completed.");
  console.log(`Report generated at: ${reportFilePath}`);
  console.log(`Total cases: ${report.totalCases}`);
  console.log(`Passed: ${report.passed}`);
  console.log(`Failed: ${report.failed}`);
  console.log(`Precision: ${report.metrics.precision}`);
  console.log(`Recall: ${report.metrics.recall}`);
  console.log(`False Positive Rate: ${report.metrics.falsePositiveRate}`);
  console.log(`False Negative Rate: ${report.metrics.falseNegativeRate}`);
}

runDecisionHarness().catch(error => {
  console.error("Decision harness failed:", error);
  process.exit(1);
});
