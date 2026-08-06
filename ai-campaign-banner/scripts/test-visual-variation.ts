// scripts/test-visual-variation.ts
//
// Controlled visual-diversity layer (src/lib/ai/visualVariation.ts).
//
// Proves the two properties the product needs:
//   RENDER DETERMINISM  — same seed → identical plans + identical effective spec.
//   GENERATION DIVERSITY — different campaigns → different visual choices, and
//                          the 3 concepts within a campaign are distinct.
// Plus: "at most one strong accent", AI-intent bias, and safe sanitization.
//
// Run: npm run test:visual   (network-free, deterministic)

import {
  allocateVisualVariations,
  buildEffectiveSpec,
  deriveCampaignVisualSeed,
  sanitizeVisualIntent,
  variationDistance,
  type VisualVariationPlan,
} from "@/lib/ai/visualVariation";
import type { MidjourneyContext } from "@/lib/schemas/midjourney.schema";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures += 1;
    console.error(`  ✗ ${msg}`);
  }
}

const CONTEXTS: MidjourneyContext[] = ["charts", "etfs", "stocks"];
function threeConcepts() {
  return CONTEXTS.map((context, i) => ({ conceptId: `concept_${i + 1}`, context }));
}
function signature(plans: VisualVariationPlan[]): string {
  return plans
    .map((p) => `${p.templateFamily}|${p.background.style}|${p.motif}|${p.accent}|${p.emphasis}|${p.cta.weight}`)
    .join("::");
}

console.log("visual variation:");

// 1. RENDER DETERMINISM — same campaign_id → identical plans.
{
  const seed = deriveCampaignVisualSeed("cam_deadbeef");
  const a = allocateVisualVariations({ campaignSeed: seed, concepts: threeConcepts() });
  const b = allocateVisualVariations({ campaignSeed: seed, concepts: threeConcepts() });
  assert(JSON.stringify(a) === JSON.stringify(b), "same seed → identical variation plans");

  const specA = buildEffectiveSpec(a[0], undefined, () => 0.4);
  const specB = buildEffectiveSpec(b[0], undefined, () => 0.4);
  assert(JSON.stringify(specA) === JSON.stringify(specB), "same plan → identical effective spec");
}

// 2. GENERATION DIVERSITY — many campaigns produce many distinct designs.
{
  const sigs = new Set<string>();
  const concept0Families = new Set<string>();
  const N = 24;
  for (let i = 0; i < N; i++) {
    const plans = allocateVisualVariations({
      campaignSeed: deriveCampaignVisualSeed(`cam_${i.toString(16)}${i}${i}`),
      concepts: threeConcepts(),
    });
    sigs.add(signature(plans));
    concept0Families.add(plans[0].templateFamily);
  }
  assert(sigs.size >= N * 0.75, `≥75% of ${N} campaigns are visually distinct (got ${sigs.size})`);
  assert(
    concept0Families.size >= 2,
    `concept 1's template family varies across campaigns (the old bug) — saw ${[...concept0Families].join(", ")}`,
  );
}

// 3. CONCEPT DISTINCTNESS within one campaign.
{
  let allDistinctFamilies = true;
  let minPairDistanceOk = true;
  for (let i = 0; i < 12; i++) {
    const plans = allocateVisualVariations({
      campaignSeed: deriveCampaignVisualSeed(`cam_dist_${i}`),
      concepts: threeConcepts(),
    });
    const fams = new Set(plans.map((p) => p.templateFamily));
    if (fams.size !== 3) allDistinctFamilies = false;
    for (let a = 0; a < plans.length; a++)
      for (let b = a + 1; b < plans.length; b++)
        if (variationDistance(plans[a], plans[b]) < 3) minPairDistanceOk = false;
  }
  assert(allDistinctFamilies, "3 concepts always get 3 distinct template families");
  assert(minPairDistanceOk, "every concept pair meets the minimum visual distance");
}

// 4. Brand rule — at most ONE strong accent per campaign.
{
  let ok = true;
  for (let i = 0; i < 30; i++) {
    const plans = allocateVisualVariations({
      campaignSeed: deriveCampaignVisualSeed(`cam_accent_${i}`),
      concepts: threeConcepts(),
    });
    if (plans.filter((p) => p.accent === "strong").length > 1) ok = false;
  }
  assert(ok, "never more than one concept uses accent_usage=strong");
}

// 5. AI intent — soft bias + safe sanitization.
{
  // preferredTemplate honored when it doesn't break distinctness.
  const plans = allocateVisualVariations({
    campaignSeed: deriveCampaignVisualSeed("cam_intent"),
    concepts: [
      { conceptId: "c1", context: "charts", intent: { preferredTemplate: "editorial_type" } },
      { conceptId: "c2", context: "etfs" },
      { conceptId: "c3", context: "stocks" },
    ],
  });
  assert(plans[0].templateFamily === "editorial_type", "AI preferredTemplate is honored when possible");

  // energy → emphasis mapping.
  const dyn = allocateVisualVariations({
    campaignSeed: deriveCampaignVisualSeed("cam_energy"),
    concepts: [{ conceptId: "c1", context: "charts", intent: { energy: "dynamic" } }],
  });
  assert(dyn[0].emphasis === "bold", "energy=dynamic → emphasis=bold");

  // sanitization: garbage → undefined; unknown enum dropped.
  assert(sanitizeVisualIntent(undefined) === undefined, "undefined intent → undefined");
  assert(sanitizeVisualIntent({ energy: "banana" }) === undefined, "invalid enum → undefined (safe fallback)");
  assert(sanitizeVisualIntent({}) === undefined, "empty object → undefined (no signal)");
  const clean = sanitizeVisualIntent({ energy: "premium", preferredTemplate: "mockup_hero", junk: 1 });
  assert(clean?.energy === "premium" && clean?.preferredTemplate === "mockup_hero", "valid fields kept, junk stripped");
}

// 6. Effective spec is coherent (family ↔ composition compatible, schema-valid).
{
  const plans = allocateVisualVariations({
    campaignSeed: deriveCampaignVisualSeed("cam_spec"),
    concepts: threeConcepts(),
  });
  for (const p of plans) {
    const spec = buildEffectiveSpec(p, undefined, () => 0.7); // throws if schema-invalid
    assert(spec.layout_type === p.templateFamily, `effective spec layout_type matches plan (${p.templateFamily})`);
    if (p.templateFamily === "mockup_hero") {
      assert(
        spec.composition === "text_leading" || spec.composition === "visual_leading",
        "mockup_hero uses a side-panel composition",
      );
    } else {
      assert(spec.composition === "hero_overlay", `${p.templateFamily} uses hero_overlay`);
    }
  }
}

if (failures > 0) {
  console.error(`\n${failures} assertion(s) failed.`);
  process.exit(1);
}
console.log("\nAll visual-variation assertions passed.");
