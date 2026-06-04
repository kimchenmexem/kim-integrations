import { validateRuleBased, getRegulatorRules } from './src/services/compliance';
import { LocaleCode } from '@mexem/shared';

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
  console.log('\n' + '='.repeat(100));
  console.log('COMPLIANCE PIPELINE TEST SUITE');
  console.log('Rule-Based Validation Results');
  console.log('='.repeat(100) + '\n');

  let passCount = 0;
  let failCount = 0;
  const results: any[] = [];

  for (const testCase of testCases) {
    const ruleBased = validateRuleBased(testCase.text, testCase.locale);
    const isCompliant = ruleBased.issues.length === 0;
    const passed = isCompliant === testCase.expectedCompliant;

    if (passed) passCount++;
    else failCount++;

    console.log(`TEST ${testCase.id}: ${testCase.category.toUpperCase()}`);
    console.log(`  Description: ${testCase.description}`);
    console.log(`  Locale: ${testCase.locale}`);
    console.log(`  Original: "${testCase.text.substring(0, 70)}${testCase.text.length > 70 ? '...' : ''}"`);
    console.log(`  Rule-Based Score: ${ruleBased.score}/10`);
    console.log(`  Issues Detected: ${ruleBased.issues.length}`);
    if (ruleBased.issues.length > 0) {
      ruleBased.issues.forEach((issue: any) => {
        console.log(`    • ${issue.category} (severity: ${issue.severity}): ${issue.description}`);
        console.log(`      Matches: ${issue.matches.slice(0, 2).join(' | ')}${issue.matches.length > 2 ? ' ...' : ''}`);
      });
    }
    console.log(`  Expected Compliant: ${testCase.expectedCompliant}`);
    console.log(`  Actual Compliant: ${isCompliant}`);
    console.log(`  Result: ${passed ? '✅ PASS' : '❌ FAIL'}`);
    console.log('-'.repeat(100));

    results.push({
      id: testCase.id,
      category: testCase.category,
      description: testCase.description,
      passed,
      expectedCompliant: testCase.expectedCompliant,
      actualCompliant: isCompliant,
      score: ruleBased.score,
      issueCount: ruleBased.issues.length,
      issues: ruleBased.issues
    });
  }

  console.log('\n' + '='.repeat(100));
  console.log('TEST SUMMARY');
  console.log('='.repeat(100));
  console.log(`Total Tests: ${testCases.length}`);
  console.log(`Passed: ${passCount} ✅`);
  console.log(`Failed: ${failCount} ❌`);
  console.log(`Pass Rate: ${((passCount / testCases.length) * 100).toFixed(1)}%`);
  console.log('='.repeat(100) + '\n');

  /* Group results by category */
  const byCategory = new Map<string, any[]>();
  results.forEach(r => {
    if (!byCategory.has(r.category)) byCategory.set(r.category, []);
    byCategory.get(r.category)!.push(r);
  });

  console.log('RESULTS BY CATEGORY:\n');
  byCategory.forEach((tests, category) => {
    const catPass = tests.filter(t => t.passed).length;
    console.log(`${category.toUpperCase()}: ${catPass}/${tests.length} PASSED`);
    tests.forEach(t => {
      console.log(`  [${t.passed ? '✅' : '❌'}] Test ${t.id}: ${t.description}`);
    });
    console.log();
  });

  return { passCount, failCount, results };
}

console.log('Starting compliance validation tests...');
try {
  runTests();
  console.log('Tests completed successfully!');
} catch (error) {
  console.error('Test failed:', error);
  process.exit(1);
}
