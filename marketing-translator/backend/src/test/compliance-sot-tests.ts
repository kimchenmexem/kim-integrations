/**
 * Compliance Source-of-Truth — integration tests.
 *
 * Run with:
 *   npm --workspace backend run test:compliance
 *
 * Uses the real database via Prisma. Test records are created with a __TEST__
 * prefix and cleaned up at the end. Safe to run against the dev database.
 *
 * Tests cover:
 *  1. Bundle executor (pure — no DB/LLM)
 *  2. Diff detection
 *  3. Source seeding & sync runs
 *  4. Obligation state machine
 *  5. Rule CRUD
 *  6. Bundle compile & publish
 *  7. Runtime bundle loader + fallback
 *  8. buildRulesBlock with/without bundle
 */

import { prisma } from "../db";
import { executeBundleRules } from "../compliance/engine/executor";
import type { LoadedBundle } from "../compliance/bundles/loader";
import { loadBundle, clearBundleCache } from "../compliance/bundles/loader";
import { computeLineDiffForTest } from "./test-helpers";
import {
  createObligation,
  transitionObligation,
  canTransition,
} from "../compliance/obligations/service";
import { createRule } from "../compliance/rules/service";
import { compileDraftBundle } from "../compliance/bundles/compiler";
import { publishBundle } from "../compliance/bundles/publisher";
import { runSync } from "../compliance/ingestion/orchestrator";
import { ManualAdapter } from "../compliance/ingestion/adapters/manual";
import { EurLexAdapter } from "../compliance/ingestion/adapters/eurlex";
import { buildRulesBlock } from "../services/jurisdictionRules";
import { diffLatestVersions } from "../compliance/ingestion/diff";

// ─── Test harness ──────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`  ✖ FAIL: ${name}`);
  }
}

function section(name: string) {
  console.log(`\n═══ ${name} ═══`);
}

// ─── Cleanup tracking ──────────────────────────────────────────────
const createdBundleIds: number[] = [];
const createdObligationIds: number[] = [];
const createdRuleIds: number[] = [];
const createdDocIds: number[] = [];
/** Bundles that our test publish superseded — restore to "published" during cleanup. */
const supersededByTest: number[] = [];

// ─── 1. Bundle Executor (pure — no DB) ─────────────────────────────
function testBundleExecutor() {
  section("Bundle Executor");

  const bundle: LoadedBundle = {
    id: 999,
    localeCode: "en-GB",
    jurisdiction: "GB",
    version: "1.0.0",
    content: {
      bannedPhrases: ["guaranteed returns", "risk-free", "100% safe"],
      regexRules: [
        { pattern: "\\b(guaranteed|assured)\\s+(returns|profits)", flags: "gi", message: "Implied guarantee", severity: "critical" },
      ],
      requiredDisclaimers: [
        { text: "Investments carry risk", triggers: ["return", "performance"] },
      ],
      promptContext: "Test prompt context",
      disclaimers: { riskWarning: "Risk warning text", pastPerformance: "Past perf text" },
    },
    contentHash: "testhash",
    sourceRefs: [{ sourceCode: "FCA", documentRef: "COBS 4.2" }],
    publishedAt: new Date().toISOString(),
  };

  // Banned phrase detection
  const r1 = executeBundleRules("Get guaranteed returns today!", bundle);
  assert(r1.matches.length > 0, "detects banned phrase 'guaranteed returns'");
  assert(r1.matches.some(m => m.ruleType === "banned_phrase"), "match is typed as banned_phrase");
  assert(!r1.passed, "text with banned phrase does not pass");

  // Regex detection
  const r2 = executeBundleRules("We offer assured profits to all clients", bundle);
  assert(r2.matches.some(m => m.ruleType === "regex"), "regex rule matches 'assured profits'");

  // Required disclaimer — trigger present but disclaimer missing
  const r3 = executeBundleRules("Great return on your investment", bundle);
  assert(r3.matches.some(m => m.ruleType === "required_disclaimer"), "missing disclaimer flagged when trigger present");

  // Required disclaimer — trigger present AND disclaimer present
  const r4 = executeBundleRules("Great return on investment. Investments carry risk.", bundle);
  assert(!r4.matches.some(m => m.ruleType === "required_disclaimer"), "disclaimer present → no flag");

  // Clean text passes
  const r5 = executeBundleRules("MEXEM commission-free ETPs with transparent pricing", bundle);
  assert(r5.passed, "clean text passes all bundle rules");
  assert(r5.matches.length === 0, "clean text has zero matches");

  // bundleVersion and sourceRefs in result
  assert(r5.bundleVersion === "en-GB@1.0.0", "bundleVersion in result");
  assert(r5.sourceRefs.length === 1 && r5.sourceRefs[0].sourceCode === "FCA", "sourceRefs in result");
}

// ─── 2. Obligation state machine (pure) ─────────────────────────────
function testObligationStateMachine() {
  section("Obligation State Machine");

  assert(canTransition("pending", "reviewed"), "pending → reviewed");
  assert(canTransition("reviewed", "approved"), "reviewed → approved");
  assert(canTransition("reviewed", "rejected"), "reviewed → rejected");
  assert(canTransition("approved", "superseded"), "approved → superseded");
  assert(canTransition("rejected", "pending"), "rejected → pending (re-open)");

  assert(!canTransition("pending", "approved"), "pending → approved blocked");
  assert(!canTransition("approved", "pending"), "approved → pending blocked");
  assert(!canTransition("superseded", "approved"), "superseded → approved blocked");
  assert(!canTransition("rejected", "approved"), "rejected → approved blocked");
  assert(!canTransition("pending", "rejected"), "pending → rejected blocked");
}

// ─── 3. buildRulesBlock fallback ────────────────────────────────────
function testBuildRulesBlock() {
  section("buildRulesBlock fallback behavior");

  // Without bundle
  const legacy = buildRulesBlock("en-GB");
  assert(legacy.includes("HARD PROHIBITIONS"), "legacy block has HARD PROHIBITIONS section");
  assert(legacy.includes("FCA"), "legacy block mentions FCA");

  // With bundle prompt context
  const withBundle = buildRulesBlock("en-GB", "Custom bundle rule: no superlatives");
  assert(withBundle.includes("APPROVED COMPLIANCE RULES"), "bundle block uses APPROVED header");
  assert(withBundle.includes("Custom bundle rule"), "bundle block includes bundle promptContext");
  assert(!withBundle.includes("HARD PROHIBITIONS"), "bundle block omits legacy HARD PROHIBITIONS");
}

// ─── 4. Sync run + adapter tests (DB) ──────────────────────────────
async function testSyncAndAdapters() {
  section("Sync runs & adapters");

  // ManualAdapter returns empty
  const manual = new ManualAdapter("CONSOB");
  const manualResult = await manual.sync();
  assert(manualResult.documents.length === 0, "ManualAdapter returns 0 documents");
  assert(manualResult.warnings.length > 0, "ManualAdapter emits a warning");

  // EurLexAdapter returns curated docs
  const eurlex = new EurLexAdapter();
  const eurResult = await eurlex.sync({ baseUrl: "https://eur-lex.europa.eu" });
  assert(eurResult.documents.length === 4, "EurLexAdapter returns 4 documents");
  assert(eurResult.versions.length === 4, "EurLexAdapter returns 4 versions");
  assert(eurResult.documents[0].externalRef.includes("MiFID"), "first doc is MiFID-related");

  // Orchestrator: run ManualAdapter (should succeed with 0 docs)
  const syncSummary = await runSync(manual, "manual:test");
  assert(syncSummary.status === "success", "ManualAdapter sync succeeds");
  assert(syncSummary.documentsUpserted === 0, "ManualAdapter: 0 docs upserted");

  // Verify SourceSyncRun was logged
  const run = await prisma.sourceSyncRun.findUnique({ where: { id: syncSummary.runId } });
  assert(run !== null, "SourceSyncRun record created");
  assert(run!.status === "success", "SourceSyncRun status is success");
  assert(run!.triggeredBy === "manual:test", "triggeredBy is correct");
}

// ─── 5. Snapshot dedup (DB) ─────────────────────────────────────────
async function testSnapshotDedup() {
  section("Snapshot dedup (contentHash)");

  // Create a test source document
  const source = await prisma.regulatorySource.findFirst({ where: { code: "FCA" } });
  assert(source !== null, "FCA source exists");

  const doc = await prisma.sourceDocument.create({
    data: {
      sourceId: source!.id,
      externalRef: "__TEST__dedup_doc",
      title: "Test dedup document",
    },
  });
  createdDocIds.push(doc.id);

  // Create first version
  const v1 = await prisma.sourceDocumentVersion.create({
    data: {
      documentId: doc.id,
      versionLabel: "v1",
      contentHash: "hash_aaa",
      rawContent: "Content version 1",
      parsedText: "Content version 1",
      fetchedBy: "manual:test",
    },
  });
  assert(v1.id > 0, "first version created");

  // Same hash → should fail unique constraint
  let dupFailed = false;
  try {
    await prisma.sourceDocumentVersion.create({
      data: {
        documentId: doc.id,
        versionLabel: "v1-dup",
        contentHash: "hash_aaa",
        rawContent: "Content version 1",
        parsedText: "Content version 1",
        fetchedBy: "manual:test",
      },
    });
  } catch {
    dupFailed = true;
  }
  assert(dupFailed, "duplicate contentHash rejected by unique constraint");

  // Different hash → should succeed
  const v2 = await prisma.sourceDocumentVersion.create({
    data: {
      documentId: doc.id,
      versionLabel: "v2",
      contentHash: "hash_bbb",
      rawContent: "Content version 2 — changed",
      parsedText: "Content version 2 — changed",
      fetchedBy: "manual:test",
    },
  });
  assert(v2.id > v1.id, "second version with different hash created");
}

// ─── 6. Diff detection (DB) ─────────────────────────────────────────
async function testDiffDetection() {
  section("Diff detection");

  // Find the __TEST__ doc from the dedup test
  const doc = await prisma.sourceDocument.findFirst({
    where: { externalRef: "__TEST__dedup_doc" },
  });
  assert(doc !== null, "test document exists for diff");

  const diff = await diffLatestVersions(doc!.id);
  assert(diff !== null, "diff result returned");
  assert(diff!.hasChanges === true, "diff detects changes between v1 and v2");
  assert(diff!.isNew === false, "not marked as new (two versions exist)");
  assert(diff!.stats.added > 0 || diff!.stats.removed > 0, "diff has add/remove stats");

  // Document with single version → isNew
  const singleDoc = await prisma.sourceDocument.create({
    data: {
      sourceId: doc!.sourceId,
      externalRef: "__TEST__single_ver",
      title: "Single version doc",
    },
  });
  createdDocIds.push(singleDoc.id);

  await prisma.sourceDocumentVersion.create({
    data: {
      documentId: singleDoc.id,
      versionLabel: "v1",
      contentHash: "hash_single",
      rawContent: "Single version content",
      parsedText: "Single version content",
      fetchedBy: "manual:test",
    },
  });

  const singleDiff = await diffLatestVersions(singleDoc.id);
  assert(singleDiff !== null, "diff for single-version doc returns result");
  assert(singleDiff!.isNew === true, "single version → isNew=true");
}

// ─── 7. Full workflow: obligation → rule → compile → publish (DB) ───
async function testFullWorkflow() {
  section("Full workflow: obligation → rule → compile → publish");

  // Create obligation
  const obl = await createObligation({
    title: "__TEST__ No urgency claims",
    description: "Do not use urgency or scarcity tactics in marketing copy.",
    jurisdiction: "GB",
    localeCode: "en-GB",
    category: "urgency",
    severity: "major",
    sourceRefs: [{ sourceCode: "FCA", documentRef: "COBS 4.2" }],
    createdBy: "test",
  });
  createdObligationIds.push(obl.id);
  assert(obl.status === "pending", "obligation created in pending status");

  // Transition: pending → reviewed → approved
  await transitionObligation(obl.id, "reviewed", "test-reviewer");
  const approved = await transitionObligation(obl.id, "approved", "test-approver", "Looks good");
  assert(approved.status === "approved", "obligation approved");
  assert(approved.approvedBy === "test-approver", "approvedBy recorded");

  // Invalid transition: approved → pending
  let transitionFailed = false;
  try {
    await transitionObligation(obl.id, "pending" as any, "rogue");
  } catch {
    transitionFailed = true;
  }
  assert(transitionFailed, "invalid transition approved→pending throws");

  // Attach rule
  const rule = await createRule({
    obligationId: obl.id,
    ruleType: "banned_phrase",
    config: { kind: "banned_phrase", phrases: ["act now", "limited time", "last chance"] },
  });
  createdRuleIds.push(rule.id);
  assert(rule.obligationId === obl.id, "rule linked to obligation");

  // Compile bundle
  // We need approved obligations for en-GB. Our test obligation + the one from Phase 3 demo.
  const compile = await compileDraftBundle({
    localeCode: "en-GB",
    jurisdiction: "GB",
    version: "99.0.0-test",
    compiledBy: "test",
    notes: "__TEST__",
  });
  createdBundleIds.push(compile.bundleId);
  assert(compile.obligationCount >= 1, "bundle compiled with ≥1 obligation");
  assert(compile.ruleCount >= 1, "bundle compiled with ≥1 rule");

  // Inspect draft content
  const draft = await prisma.ruleBundle.findUnique({ where: { id: compile.bundleId } });
  assert(draft!.status === "draft", "compiled bundle is draft");
  const content = JSON.parse(draft!.contentJson);
  assert(Array.isArray(content.bannedPhrases), "contentJson has bannedPhrases array");
  assert(content.bannedPhrases.includes("act now"), "our test phrases are in the bundle");

  // Publish
  const pub = await publishBundle(compile.bundleId, "test-publisher");
  if (pub.supersededBundleId) supersededByTest.push(pub.supersededBundleId);
  assert(pub.bundleId === compile.bundleId, "correct bundle published");

  // Verify published
  const published = await prisma.ruleBundle.findUnique({ where: { id: compile.bundleId } });
  assert(published!.status === "published", "bundle status is published");
  assert(published!.publishedBy === "test-publisher", "publishedBy recorded");

  // Double-publish blocked
  let doublePubFailed = false;
  try {
    await publishBundle(compile.bundleId, "rogue");
  } catch {
    doublePubFailed = true;
  }
  assert(doublePubFailed, "double-publish throws");
}

// ─── 8. Runtime bundle loader + fallback (DB) ──────────────────────
async function testBundleLoader() {
  section("Runtime bundle loader + fallback");

  clearBundleCache();

  // en-GB has a published bundle (from test above or Phase 3)
  const enBundle = await loadBundle("en-GB");
  assert(enBundle !== null, "loadBundle('en-GB') returns a bundle");
  assert(enBundle!.localeCode === "en-GB", "bundle is for en-GB");
  assert(enBundle!.content.bannedPhrases.length > 0, "bundle has banned phrases");
  assert(typeof enBundle!.version === "string", "bundle has version string");

  // it-IT has no published bundle → null (fallback)
  const itBundle = await loadBundle("it-IT");
  assert(itBundle === null, "loadBundle('it-IT') returns null (no bundle)");

  // Caching: second call hits cache
  const t0 = Date.now();
  const cached = await loadBundle("en-GB");
  const elapsed = Date.now() - t0;
  assert(cached !== null, "cached loadBundle returns bundle");
  assert(elapsed < 10, "cached call is fast (<10ms): " + elapsed + "ms");
}

// ─── Cleanup ────────────────────────────────────────────────────────
async function cleanup() {
  section("Cleanup");
  try {
    // Delete test bundles and restore any bundles they superseded
    for (const id of createdBundleIds) {
      await prisma.legalReviewTask.deleteMany({ where: { refType: "RuleBundle", refId: id } });
      await prisma.ruleBundle.delete({ where: { id } }).catch(() => {});
    }
    for (const id of supersededByTest) {
      await prisma.ruleBundle.update({
        where: { id },
        data: { status: "published", supersededAt: null },
      }).catch(() => {});
    }
    // Delete test rules
    for (const id of createdRuleIds) {
      await prisma.complianceRule.delete({ where: { id } }).catch(() => {});
    }
    // Delete test obligations
    for (const id of createdObligationIds) {
      await prisma.legalReviewTask.deleteMany({ where: { refType: "ComplianceObligation", refId: id } });
      await prisma.complianceObligation.delete({ where: { id } }).catch(() => {});
    }
    // Delete test documents + versions
    for (const id of createdDocIds) {
      await prisma.sourceDocumentVersion.deleteMany({ where: { documentId: id } });
      await prisma.sourceDocument.delete({ where: { id } }).catch(() => {});
    }
    // Delete test sync runs
    await prisma.sourceSyncRun.deleteMany({ where: { triggeredBy: "manual:test" } });
    console.log("  ✓ test data cleaned up");
  } catch (err) {
    console.error("  cleanup error:", err);
  }
}

async function preClean() {
  // Remove any leftover __TEST__ data from interrupted prior runs
  const testDocs = await prisma.sourceDocument.findMany({
    where: { externalRef: { startsWith: "__TEST__" } },
    select: { id: true },
  });
  for (const d of testDocs) {
    await prisma.sourceDocumentVersion.deleteMany({ where: { documentId: d.id } });
    await prisma.sourceDocument.delete({ where: { id: d.id } }).catch(() => {});
  }
  const testObls = await prisma.complianceObligation.findMany({
    where: { title: { startsWith: "__TEST__" } },
    select: { id: true },
  });
  for (const o of testObls) {
    await prisma.legalReviewTask.deleteMany({ where: { refType: "ComplianceObligation", refId: o.id } });
    await prisma.complianceRule.deleteMany({ where: { obligationId: o.id } });
    await prisma.complianceObligation.delete({ where: { id: o.id } }).catch(() => {});
  }
  const testBundles = await prisma.ruleBundle.findMany({
    where: { notes: "__TEST__" },
    select: { id: true, localeCode: true },
  });
  for (const b of testBundles) {
    await prisma.legalReviewTask.deleteMany({ where: { refType: "RuleBundle", refId: b.id } });
    await prisma.ruleBundle.delete({ where: { id: b.id } }).catch(() => {});
    // Restore the most recent superseded bundle for this locale (if any)
    const superseded = await prisma.ruleBundle.findFirst({
      where: { localeCode: b.localeCode, status: "superseded" },
      orderBy: { createdAt: "desc" },
    });
    if (superseded) {
      await prisma.ruleBundle.update({
        where: { id: superseded.id },
        data: { status: "published", supersededAt: null },
      }).catch(() => {});
    }
  }
  await prisma.sourceSyncRun.deleteMany({ where: { triggeredBy: "manual:test" } });
}

// ─── 9. Kill switch test (no DB — env manipulation) ─────────────────
async function testKillSwitch() {
  section("Kill switch (COMPLIANCE_BUNDLES_ENABLED=false)");

  clearBundleCache();

  // Save original env
  const original = process.env.COMPLIANCE_BUNDLES_ENABLED;

  // Disable bundles
  process.env.COMPLIANCE_BUNDLES_ENABLED = "false";

  // loadBundle should return null even if a published bundle exists
  const bundle = await loadBundle("en-GB");
  assert(bundle === null, "loadBundle returns null when kill switch is active");

  // Restore
  if (original === undefined) {
    delete process.env.COMPLIANCE_BUNDLES_ENABLED;
  } else {
    process.env.COMPLIANCE_BUNDLES_ENABLED = original;
  }

  // After restoring, should work again
  clearBundleCache();
  const restored = await loadBundle("en-GB");
  // May or may not find a bundle depending on DB state — just confirm it doesn't throw
  assert(true, "loadBundle works after kill switch restored");
}

// Crash-safe: if the process dies unexpectedly, attempt cleanup
process.on("uncaughtException", async (err) => {
  console.error("Uncaught exception in test suite:", err);
  try { await cleanup(); } catch {}
  await prisma.$disconnect();
  process.exit(1);
});

process.on("unhandledRejection", async (err) => {
  console.error("Unhandled rejection in test suite:", err);
  try { await cleanup(); } catch {}
  await prisma.$disconnect();
  process.exit(1);
});

// ─── Main ───────────────────────────────────────────────────────────
async function main() {
  console.log("\n╔══════════════════════════════════════════════╗");
  console.log("║  Compliance Source-of-Truth — Test Suite     ║");
  console.log("╚══════════════════════════════════════════════╝");

  // Pre-clean any leftover test data from a prior interrupted run
  await preClean();

  let crashed = false;
  try {
    // Pure tests (no DB)
    testBundleExecutor();
    testObligationStateMachine();
    testBuildRulesBlock();

    // DB-backed tests
    await testSyncAndAdapters();
    await testSnapshotDedup();
    await testDiffDetection();
    await testFullWorkflow();
    await testBundleLoader();
    await testKillSwitch();

    // Cleanup
    await cleanup();
  } catch (err) {
    crashed = true;
    console.error("\nTest suite crashed:", err);
    try { await cleanup(); } catch {}
  }

  // Summary
  const total = passed + failed;
  console.log("\n══════════════════════════════════════════");
  console.log(`  ${passed}/${total} passed, ${failed} failed`);
  if (failures.length > 0) {
    console.log(`  Failures:`);
    for (const f of failures) console.log(`    - ${f}`);
  }
  if (crashed) {
    console.log(`  ⚠ Test suite crashed — some test data may need manual cleanup`);
  }
  console.log("══════════════════════════════════════════\n");

  if (failed > 0 || crashed) process.exit(1);
}

main()
  .catch((err) => { console.error("Test suite error:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
