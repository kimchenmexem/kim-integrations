/**
 * Task 3 — campaign-copy fail-closed unit tests.
 *
 * Verifies the gating logic that decides whether generated copy may ship:
 *   - a shippable summary (all auto_approved / rewritten) → ok = true
 *   - any blocked / escalated field → ok = false, and the error captures it
 *   - "notes-only" NON_COMPLIANT (issues present but marked shippable) can NEVER
 *     occur — shippability is derived from finalAction, not from issue count.
 *
 * Pure logic only — no OpenAI / DB. Run: npx ts-node --transpile-only
 * src/test/campaign-copy-failclosed-tests.ts   (or via npm run test:campaign-copy)
 */

import type { FieldComplianceMeta } from "@mexem/shared";
import { summarize, CampaignCopyComplianceError } from "../services/campaignCopy";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) {
    console.log(`  ✓ ${msg}`);
  } else {
    failures += 1;
    console.error(`  ✗ ${msg}`);
  }
}

function field(overrides: Partial<FieldComplianceMeta>): FieldComplianceMeta {
  return {
    field: "headline",
    status: "SAFE",
    finalAction: "auto_approved",
    confidence: 90,
    rewritten: false,
    shippable: true,
    issues: [],
    ...overrides,
  };
}

console.log("campaign-copy fail-closed:");

// 1. All shippable → ok
{
  const s = summarize([
    field({ field: "headline", finalAction: "auto_approved", shippable: true }),
    field({ field: "cta", finalAction: "rewritten", rewritten: true, shippable: true, status: "SAFE" }),
  ]);
  assert(s.ok === true, "all auto_approved/rewritten fields → summary.ok = true");
  assert(s.decision === "SAFE", "worst-case decision is SAFE when all safe");
}

// 2. A blocked field → not ok, worst-case NON_COMPLIANT
{
  const s = summarize([
    field({ field: "headline", shippable: true }),
    field({
      field: "disclaimer",
      status: "NON_COMPLIANT",
      finalAction: "blocked",
      shippable: false,
      issues: ["Implied guarantee of returns."],
    }),
  ]);
  assert(s.ok === false, "a blocked field → summary.ok = false");
  assert(s.decision === "NON_COMPLIANT", "worst-case decision escalates to NON_COMPLIANT");
}

// 3. An escalated (human review) field → not ok
{
  const s = summarize([
    field({ field: "subheadline", status: "UNCERTAIN", finalAction: "escalated_to_human_review", shippable: false }),
  ]);
  assert(s.ok === false, "an escalated_to_human_review field → summary.ok = false");
}

// 4. The error captures ONLY the blocked fields
{
  const metas = [
    field({ field: "headline", shippable: true }),
    field({ field: "cta", status: "NON_COMPLIANT", finalAction: "blocked", shippable: false }),
  ];
  const err = new CampaignCopyComplianceError("en-GB", summarize(metas));
  assert(err.blockedFields.length === 1, "error.blockedFields contains exactly the non-shippable field");
  assert(err.blockedFields[0].field === "cta", "error.blockedFields identifies the cta field");
  assert(err.locale === "en-GB", "error carries the locale");
}

// 5. A "notes-only" failure is impossible: issues present but auto_approved still ships.
// (Shippability is derived from finalAction, so this is by construction — the
//  test documents the invariant.)
{
  const s = summarize([field({ issues: ["stylistic note"], finalAction: "auto_approved", shippable: true })]);
  assert(s.ok === true, "issues on an auto_approved field do NOT block (shippability ≠ issue count)");
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll campaign-copy fail-closed assertions passed.");
