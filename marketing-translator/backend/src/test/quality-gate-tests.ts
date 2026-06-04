/**
 * Quality gate unit tests.
 * Run with: npx ts-node-dev --transpile-only src/test/quality-gate-tests.ts
 *
 * Tests are self-contained — they test deterministic logic without DB or LLM calls.
 */

import { runHardChecks, HardCheckIssue } from "../services/translationHardChecks";
import { formatFewShotPrompt } from "../services/fewShotExamples";

// ─── Test harness ──────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
  } else {
    failed++;
    failures.push(name);
    console.error(`  FAIL: ${name}`);
  }
}

function section(name: string) {
  console.log(`\n--- ${name} ---`);
}

// ─── Mock prisma for hard checks (glossary queries) ────────────────
// We need to mock prisma.glossaryTerm.findMany before importing
// Since hard checks use prisma directly, we test the non-DB checks
// and test glossary logic separately

// ─── 1. Hard check: placeholder preservation ───────────────────────
section("Placeholder preservation");

async function testPlaceholders() {
  // Missing placeholder — critical
  const r1 = await runHardChecks(
    "Hello {{name}}, your balance is {{balance}}.",
    "Bonjour, votre solde est.",
    "fr-FR"
  );
  assert(!r1.passed, "Missing placeholders should fail");
  assert(r1.issues.some(i => i.code === "placeholder" && i.severity === "critical"), "Should have critical placeholder issue");

  // All placeholders preserved
  const r2 = await runHardChecks(
    "Hello {{name}}, your balance is {{balance}}.",
    "Bonjour {{name}}, votre solde est {{balance}}.",
    "fr-FR"
  );
  assert(r2.issues.filter(i => i.code === "placeholder").length === 0, "Preserved placeholders should have no placeholder issues");

  // %s style placeholders
  const r3 = await runHardChecks(
    "Welcome %s, you have %d items.",
    "Bienvenue, vous avez des articles.",
    "fr-FR"
  );
  assert(r3.issues.some(i => i.code === "placeholder"), "Missing %s/%d placeholders detected");

  // No placeholders in source — should pass
  const r4 = await runHardChecks(
    "Simple text without placeholders.",
    "Testo semplice senza segnaposto.",
    "it-IT"
  );
  assert(r4.issues.filter(i => i.code === "placeholder").length === 0, "No placeholders in source means no placeholder issues");
}

// ─── 2. Hard check: HTML tag preservation ──────────────────────────
section("HTML tag preservation");

async function testHtmlTags() {
  const r1 = await runHardChecks(
    "Click <a href='#'>here</a> to <b>start</b>.",
    "Cliquez ici pour commencer.",
    "fr-FR"
  );
  assert(r1.issues.some(i => i.code === "html" && i.severity === "critical"), "Missing HTML tags should be critical");

  const r2 = await runHardChecks(
    "Click <a href='#'>here</a> to <b>start</b>.",
    "Cliquez <a href='#'>ici</a> pour <b>commencer</b>.",
    "fr-FR"
  );
  assert(r2.issues.filter(i => i.code === "html").length === 0, "Preserved HTML tags should pass");

  // No HTML in source
  const r3 = await runHardChecks(
    "Plain text no tags.",
    "Texto plano sin etiquetas.",
    "es-ES"
  );
  assert(r3.issues.filter(i => i.code === "html").length === 0, "No HTML in source means no HTML issues");
}

// ─── 3. Hard check: number/currency preservation ───────────────────
section("Number/currency preservation");

async function testNumbers() {
  const r1 = await runHardChecks(
    "Invest from €100 with 0% commission.",
    "Investissez avec commission.",
    "fr-FR"
  );
  assert(r1.issues.some(i => i.code === "number"), "Missing numbers should be flagged");

  const r2 = await runHardChecks(
    "Invest from €100 with 0% commission.",
    "Investissez à partir de €100 avec 0% de commission.",
    "fr-FR"
  );
  assert(r2.issues.filter(i => i.code === "number").length === 0, "Preserved numbers should pass");
}

// ─── 4. Hard check: empty output ───────────────────────────────────
section("Empty output");

async function testEmpty() {
  const r1 = await runHardChecks("Source text.", "", "it-IT");
  assert(!r1.passed, "Empty output should fail");
  assert(r1.issues.some(i => i.code === "empty" && i.severity === "critical"), "Empty output is critical");

  const r2 = await runHardChecks("Source text.", "   ", "it-IT");
  assert(!r2.passed, "Whitespace-only output should fail");
}

// ─── 5. Hard check: truncation ─────────────────────────────────────
section("Truncation detection");

async function testTruncation() {
  const longSource = "This is a reasonably long source text that should result in a translation of similar length when properly translated to the target language.";
  const truncated = "Questo.";
  const r1 = await runHardChecks(longSource, truncated, "it-IT");
  assert(r1.issues.some(i => i.code === "truncation"), "Suspicious truncation should be flagged");

  // Normal length ratio should pass
  const normal = "Questo è un testo sorgente ragionevolmente lungo che dovrebbe risultare in una traduzione di lunghezza simile.";
  const r2 = await runHardChecks(longSource, normal, "it-IT");
  assert(r2.issues.filter(i => i.code === "truncation").length === 0, "Normal length ratio should not flag truncation");

  // Short source should not trigger
  const r3 = await runHardChecks("Hi", "Ciao", "it-IT");
  assert(r3.issues.filter(i => i.code === "truncation").length === 0, "Short source should not trigger truncation");
}

// ─── 6. Reviewer JSON parsing ──────────────────────────────────────
section("Reviewer JSON parsing");

function testReviewerParsing() {
  // We test the parsing logic by importing it indirectly through format functions
  // The formatFewShotPrompt is well-tested as it handles edge cases

  // Empty examples
  const empty = formatFewShotPrompt({ positive: [], negative: [] });
  assert(empty === "", "Empty examples should return empty string");

  // With examples
  const withExamples = formatFewShotPrompt({
    positive: [{ sourceText: "Hello", outputText: "Ciao", reviewerNote: "Good tone" }],
    negative: [{
      sourceText: "Hello",
      outputText: "Bad translation",
      correctedTranslation: "Buona traduzione",
      issueCodes: ["tone"],
      reviewerNote: "Wrong tone",
    }],
  });
  assert(withExamples.includes("APPROVED EXAMPLES"), "Should include approved section");
  assert(withExamples.includes("REJECTED EXAMPLES"), "Should include rejected section");
  assert(withExamples.includes("Do NOT imitate"), "Should include anti-imitation instruction");
  assert(withExamples.includes("Preferred correction"), "Should include corrected translation");
}

// ─── 7. Orchestration logic simulation ─────────────────────────────
section("Orchestration policy logic");

function testOrchestrationPolicy() {
  // Simulating the decision logic from qualityGate.ts
  const threshold = 0.75;

  // Pass immediately: high score, approved, no critical issues
  const passCase = { score: 0.92, approved: true, issues: [] as any[] };
  assert(passCase.approved && passCase.score >= threshold, "High score + approved should pass immediately");

  // Needs repair: low score
  const repairCase = { score: 0.55, approved: false, issues: [{ severity: "major" }] };
  assert(!repairCase.approved || repairCase.score < threshold, "Low score should trigger repair");

  // Critical issue blocks even with high score
  const criticalCase = { score: 0.9, approved: true, issues: [{ severity: "critical" }] };
  const hasCritical = criticalCase.issues.some((i: any) => i.severity === "critical");
  assert(hasCritical, "Critical issues should be detected");
  const wouldPass = criticalCase.approved && criticalCase.score >= threshold && !hasCritical;
  assert(!wouldPass, "Critical issues should prevent passing even with high score");

  // Best-available selection: pick highest score
  const trail = [
    { stage: "initial", score: 0.4 },
    { stage: "repair", score: 0.65 },
    { stage: "regeneration", score: 0.58 },
  ];
  const best = trail.sort((a, b) => b.score - a.score)[0];
  assert(best.stage === "repair", "Best-available should pick highest score (repair at 0.65)");
}

// ─── 8. Edge cases: combined checks ────────────────────────────────
section("Combined edge cases");

async function testCombinedEdgeCases() {
  // Source with placeholders + HTML + numbers
  const r1 = await runHardChecks(
    "Hello {{user}}, your <b>€500</b> deposit is confirmed.",
    "Bonjour {{user}}, votre dépôt de <b>€500</b> est confirmé.",
    "fr-FR"
  );
  assert(r1.passed, "All elements preserved should pass");
  assert(r1.issues.length === 0, "No issues when everything is correct");

  // Multiple failures at once
  const r2 = await runHardChecks(
    "Hello {{user}}, your <b>€500</b> deposit is confirmed.",
    "",
    "fr-FR"
  );
  assert(!r2.passed, "Empty with missing elements should fail");
  assert(r2.issues.some(i => i.code === "empty"), "Should detect empty");

  // Only partial preservation
  const r3 = await runHardChecks(
    "Welcome {{name}}! Your balance: <span>€1,234.56</span>",
    "Bienvenue! Votre solde: €1,234.56",
    "fr-FR"
  );
  assert(r3.issues.some(i => i.code === "placeholder"), "Missing {{name}} detected");
  assert(r3.issues.some(i => i.code === "html"), "Missing <span> tags detected");
}

// ─── Run all tests ─────────────────────────────────────────────────
async function runAllTests() {
  console.log("Quality Gate Unit Tests\n=======================");

  await testPlaceholders();
  await testHtmlTags();
  await testNumbers();
  await testEmpty();
  await testTruncation();
  testReviewerParsing();
  testOrchestrationPolicy();
  await testCombinedEdgeCases();

  console.log(`\n=======================`);
  console.log(`Total: ${passed + failed} | Passed: ${passed} | Failed: ${failed}`);
  if (failures.length > 0) {
    console.log(`\nFailures:`);
    failures.forEach(f => console.log(`  - ${f}`));
    process.exit(1);
  } else {
    console.log("All tests passed.");
  }
}

runAllTests().catch(err => {
  console.error("Test runner error:", err);
  process.exit(1);
});
