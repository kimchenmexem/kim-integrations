/**
 * COMPLIANCE TEST SUITE - STANDALONE
 * 
 * Tests the rule-based compliance validation pipeline
 * This version extracts rule-based logic to avoid OpenAI API key requirement
 */

import { LocaleCode } from '@mexem/shared';

interface ComplianceCategory {
  name: string;
  patterns: (string | RegExp)[];
  severity: number;
  description: string;
}

interface RegulatorRules {
  regulator: string;
  disclaimer: string;
  toneGuidelines: string;
  additionalConstraints: string[];
  categories: ComplianceCategory[];
}

/* STANDALONE RULE DEFINITIONS (copied from compliance service) */
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
    disclaimer: "Financiële investeringen dragen risico's met zich mee, inclusief verlies van kapitaal. Raadpleeg een financieel adviseur.",
    toneGuidelines: "Professional and cautious. Avoid exaggeration.",
    additionalConstraints: ["No guaranteed returns", "Risk warnings mandatory"],
    categories: [
      {
        name: "guarantees",
        patterns: [/garantie|garant/i, /veilig/i, /zonder risico/i, /100% veilig/i],
        severity: 9,
        description: "Guarantees"
      },
      {
        name: "urgency",
        patterns: [/onmiddellijk|nu|direct/i, /beperkt/i, /laatste kans/i],
        severity: 7,
        description: "Urgency"
      },
      {
        name: "authority",
        patterns: [/beste/i, /top/i, /leider/i, /nummer een/i],
        severity: 6,
        description: "Authority claims"
      },
      {
        name: "promotional",
        patterns: [/makkelijk/i, /simpel/i, /snel/i, /zonder moeite/i],
        severity: 5,
        description: "Promotional"
      }
    ]
  },
  "nl-BE": {
    regulator: "FSMA",
    disclaimer: "Financiële investeringen dragen risico's met zich mee, inclusief verlies van kapitaal. Raadpleeg een financieel adviseur.",
    toneGuidelines: "Professional and cautious. Avoid exaggeration.",
    additionalConstraints: ["No guaranteed returns", "Risk warnings mandatory"],
    categories: [
      {
        name: "guarantees",
        patterns: [/garantie|garant/i, /veilig/i, /zonder risico/i, /100% veilig/i],
        severity: 9,
        description: "Guarantees"
      },
      {
        name: "urgency",
        patterns: [/onmiddellijk|nu|direct/i, /beperkt/i, /laatste kans/i],
        severity: 7,
        description: "Urgency"
      },
      {
        name: "authority",
        patterns: [/beste/i, /top/i, /leider/i, /nummer een/i],
        severity: 6,
        description: "Authority claims"
      },
      {
        name: "promotional",
        patterns: [/makkelijk/i, /simpel/i, /snel/i, /zonder moeite/i],
        severity: 5,
        description: "Promotional"
      }
    ]
  },
  "fr-BE": {
    regulator: "FSMA",
    disclaimer: "Les investissements financiers comportent des risques, y compris la perte du capital. Consultez un conseiller financier.",
    toneGuidelines: "Use professional, factual language. Avoid emotional appeals.",
    additionalConstraints: ["No past performance guarantees", "Clear risk disclosure"],
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
        description: "Authority claims"
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
        description: "Authority claims"
      },
      {
        name: "promotional",
        patterns: [/fácil/i, /simple/i, /rápido/i, /sin esfuerzo/i],
        severity: 5,
        description: "Promotional"
      }
    ]
  }
};

/* STANDALONE VALIDATION FUNCTION */
function validateRuleBasedStandalone(
  text: string,
  locale: LocaleCode
): {
  issues: Array<{ category: string; severity: number; description: string; matches: string[] }>;
  score: number;
} {
  const rules = regulatorRules[locale];
  const issues: Array<{ category: string; severity: number; description: string; matches: string[] }> = [];
  const matchedCategories = new Set<string>();

  for (const category of rules.categories) {
    for (const pattern of category.patterns) {
      const regex = typeof pattern === 'string' ? new RegExp(pattern, 'gi') : pattern;
      const matches = text.match(regex);

      if (matches && matches.length > 0) {
        if (!matchedCategories.has(category.name)) {
          issues.push({
            category: category.name,
            severity: category.severity,
            description: category.description,
            matches: [...new Set(matches.map(m => m.toLowerCase()))]
          });
          matchedCategories.add(category.name);
        }
      }
    }
  }

  /* Calculate score: 10 if no issues, otherwise reduce based on severity */
  let score = 10;
  if (issues.length > 0) {
    const maxSeverity = Math.max(...issues.map(i => i.severity));
    const issueCount = issues.length;
    score = Math.max(0, 10 - (maxSeverity * 0.8 + issueCount * 0.5));
  }

  return { issues, score };
}

interface TestCase {
  id: number;
  category: string;
  description: string;
  text: string;
  locale: LocaleCode;
  expectedCompliant: boolean;
}

const testCases: TestCase[] = [
  /* CLEARLY COMPLIANT */
  {
    id: 1,
    category: 'clearly_compliant',
    description: 'Factual, neutral trading description',
    text: 'MEXEM offers a self-directed trading platform where you can trade various financial instruments. Please note that trading involves risks, including potential loss of principal.',
    locale: 'it-IT',
    expectedCompliant: true
  },
  {
    id: 2,
    category: 'clearly_compliant',
    description: 'Educational content with risk disclosure',
    text: 'Learn about different trading strategies. Past performance is not indicative of future results. All investments carry risk.',
    locale: 'fr-FR',
    expectedCompliant: true
  },
  {
    id: 3,
    category: 'clearly_compliant',
    description: 'Neutral feature description',
    text: 'Our platform provides real-time market data, advanced charting tools, and execution capabilities for active traders.',
    locale: 'nl-NL',
    expectedCompliant: true
  },
  {
    id: 4,
    category: 'clearly_compliant',
    description: 'Risk acknowledgment focused',
    text: 'Trading financial instruments carries significant risk. You should only trade with capital you can afford to lose completely.',
    locale: 'es-ES',
    expectedCompliant: true
  },

  /* CLEARLY NON-COMPLIANT */
  {
    id: 5,
    category: 'clearly_noncompliant_guarantees',
    description: 'Explicit guarantee of returns',
    text: 'Guaranteed returns of 20% per month with zero risk. Join now for assured profits!',
    locale: 'it-IT',
    expectedCompliant: false
  },
  {
    id: 6,
    category: 'clearly_noncompliant_guarantees',
    description: 'Promise-based language',
    text: 'We guarantee you will never lose money. Our system is 100% safe and secure.',
    locale: 'fr-FR',
    expectedCompliant: false
  },
  {
    id: 7,
    category: 'clearly_noncompliant_urgency',
    description: 'Artificial urgency and pressure',
    text: 'LIMITED TIME OFFER! Act immediately or miss this opportunity forever! Only 5 spots left!',
    locale: 'nl-NL',
    expectedCompliant: false
  },
  {
    id: 8,
    category: 'clearly_noncompliant_authority',
    description: 'False authority/endorsement',
    text: 'Endorsed by the European Banking Authority as the safest trading platform. Never lose again!',
    locale: 'es-ES',
    expectedCompliant: false
  },

  /* BORDERLINE / AMBIGUOUS */
  {
    id: 9,
    category: 'borderline_soft_guarantee',
    description: 'Soft guarantee language ("should", "likely")',
    text: 'Our sophisticated risk management tools should help you protect your investments. Most of our traders see positive results.',
    locale: 'it-IT',
    expectedCompliant: false
  },
  {
    id: 10,
    category: 'borderline_opportunity_language',
    description: 'Opportunity-framing (edge case)',
    text: 'Now is a great time to explore the market. Traders who started this quarter have positioned themselves well.',
    locale: 'fr-FR',
    expectedCompliant: false
  },
  {
    id: 11,
    category: 'borderline_comparative',
    description: 'Competitive comparison without explicit claim',
    text: 'We have lower fees than competitors and better execution speeds than the industry average.',
    locale: 'nl-NL',
    expectedCompliant: true
  },
  {
    id: 12,
    category: 'borderline_success_stories',
    description: 'Results-focused testimonial-adjacent language',
    text: 'Our traders have achieved impressive results. One trader turned $10,000 into $150,000 in one year.',
    locale: 'es-ES',
    expectedCompliant: false
  },

  /* IMPLIED GUARANTEE */
  {
    id: 13,
    category: 'implied_guarantee_profit',
    description: 'Implied guarantee through comparative framing',
    text: 'Join thousands of successful traders. Take control of your financial future today.',
    locale: 'it-IT',
    expectedCompliant: false
  },
  {
    id: 14,
    category: 'implied_guarantee_authority',
    description: 'Fake expertise/authority claim',
    text: 'Our Expert Traders program has helped millions build wealth. Expert guidance from seasoned professionals.',
    locale: 'fr-FR',
    expectedCompliant: false
  },

  /* URGENCY / PRESSURE */
  {
    id: 15,
    category: 'urgency_pressure',
    description: 'High-pressure scarcity marketing',
    text: 'Spaces filling fast! This market opening only happens once per quarter. Secure your position immediately before slots close.',
    locale: 'nl-NL',
    expectedCompliant: false
  }
];

function runTests() {
  console.log('\n' + '='.repeat(110));
  console.log('COMPLIANCE PIPELINE TEST SUITE - RULE-BASED VALIDATION');
  console.log('Testing 15 cases across regulatory locales (ESMA, AMF, AFM, FSMA, CNMV)');
  console.log('='.repeat(110) + '\n');

  let passCount = 0;
  let failCount = 0;
  const results: any[] = [];

  for (const testCase of testCases) {
    const ruleBased = validateRuleBasedStandalone(testCase.text, testCase.locale);
    const isCompliant = ruleBased.issues.length === 0;
    const passed = isCompliant === testCase.expectedCompliant;

    if (passed) passCount++;
    else failCount++;

    console.log(`[TEST ${String(testCase.id).padStart(2)}] ${testCase.category.toUpperCase()}`);
    console.log(`               Description: ${testCase.description}`);
    console.log(`               Locale: ${testCase.locale} | Regulator: ${regulatorRules[testCase.locale].regulator}`);
    console.log(`               Original: "${testCase.text.substring(0, 75)}${testCase.text.length > 75 ? '...' : ''}"`);
    console.log(`               Rule-Based Score: ${ruleBased.score.toFixed(1)}/10`);
    console.log(`               Issues Detected: ${ruleBased.issues.length}`);
    
    if (ruleBased.issues.length > 0) {
      ruleBased.issues.forEach((issue: any, idx: number) => {
        console.log(`                 ${idx + 1}. ${issue.category.toUpperCase()} (severity: ${issue.severity}/10)`);
        console.log(`                    ${issue.description}`);
        console.log(`                    Matched: ${issue.matches.slice(0, 3).join(' | ')}${issue.matches.length > 3 ? ` + ${issue.matches.length - 3} more` : ''}`);
      });
    }
    console.log(`               Expected: ${testCase.expectedCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'} | Actual: ${isCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
    console.log(`               Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log();

    results.push({
      id: testCase.id,
      category: testCase.category,
      description: testCase.description,
      locale: testCase.locale,
      text: testCase.text,
      passed,
      expectedCompliant: testCase.expectedCompliant,
      actualCompliant: isCompliant,
      score: ruleBased.score,
      issueCount: ruleBased.issues.length,
      issues: ruleBased.issues
    });
  }

  console.log('='.repeat(110));
  console.log('TEST SUMMARY');
  console.log('='.repeat(110));
  console.log(`Total: ${testCases.length} | Passed: ${passCount} ✅ | Failed: ${failCount} ❌ | Pass Rate: ${((passCount / testCases.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(110) + '\n');

  /* Group by category */
  const byCategory = new Map<string, any[]>();
  results.forEach(r => {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  });

  console.log('BREAKDOWN BY CATEGORY:\n');
  let categoryNum = 1;
  byCategory.forEach((tests, category) => {
    const catPass = tests.filter(t => t.passed).length;
    const passRate = ((catPass / tests.length) * 100).toFixed(0);
    console.log(`${categoryNum}. ${category.replace(/_/g, ' ').toUpperCase()}: ${catPass}/${tests.length} (${passRate}%)`);
    tests.forEach(t => {
      const mark = t.passed ? '✅' : '❌';
      console.log(`   ${mark} Test ${t.id}: ${t.description} (Score: ${t.score.toFixed(1)}/10, Issues: ${t.issueCount})`);
    });
    console.log();
    categoryNum++;
  });

  return { passCount, failCount, results, byCategory };
}

console.log('Initializing compliance test suite...');
try {
  const testResults = runTests();
  console.log('\n✅ Test suite completed successfully!\n');
  
  /* Provide failure case analysis */
  const failedTests = testResults.results.filter((r: any) => !r.passed);
  if (failedTests.length > 0) {
    console.log('⚠️  FAILED TESTS ANALYSIS:\n');
    failedTests.forEach((test: any) => {
      console.log(`Test ${test.id} (${test.category}): ${test.description}`);
      console.log(`  Expected: ${test.expectedCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
      console.log(`  Got: ${test.actualCompliant ? 'COMPLIANT' : 'NON-COMPLIANT'}`);
      console.log(`  Text: "${test.text.substring(0, 60)}..."`);
      console.log(`  Issues Detected: ${test.issueCount}`);
      console.log();
    });
  }
} catch (error) {
  console.error('❌ Test suite failed:', error);
  process.exit(1);
}
