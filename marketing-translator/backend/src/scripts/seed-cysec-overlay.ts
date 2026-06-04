/**
 * Seed CySEC overlay — apply CySEC rules across ALL locale bundles.
 *
 * Why an overlay (not a per-locale obligation): CySEC is MEXEM's
 * licensing regulator. CySEC obligations apply to every promotion MEXEM
 * publishes regardless of which EU/UK locale it targets — passporting
 * is granted on the home-regulator's authority, not the destination's.
 *
 * Composition model:
 *   - CY obligations are created with jurisdiction="CY", localeCode=null
 *     so they can be pulled into any locale via overlays=["CY"].
 *   - Every existing locale bundle is recompiled to v1.2.0 with overlays:
 *       it-IT  →  IT + EU + CY  (compiler auto-adds EU for EU members)
 *       fr-FR  →  FR + EU + CY
 *       nl-NL  →  NL + EU + CY
 *       nl-BE  →  BE + EU + CY
 *       fr-BE  →  BE + EU + CY
 *       es-ES  →  ES + EU + CY
 *       en-GB  →  GB + CY        (no EU baseline for UK)
 *
 * Idempotent: obligations are looked up by title, bundles by (locale, version).
 *
 * Run: npm --workspace backend run seed:cysec-overlay
 */

import { prisma } from "../db";
import { compileDraftBundle } from "../compliance/bundles/compiler";
import { publishBundle } from "../compliance/bundles/publisher";

const NEW_VERSION = "1.2.0";

interface CySecSeed {
  title: string;
  description: string;
  category: string;
  severity: "critical" | "major" | "minor";
  sourceRefs: Array<{ sourceCode: string; documentRef?: string; quote?: string }>;
  rules: Array<{
    ruleType: "banned_phrase" | "required_disclaimer" | "semantic_check";
    config: Record<string, unknown>;
    severity?: "critical" | "major" | "minor";
  }>;
}

const CYSEC_SEEDS: CySecSeed[] = [
  // 1 — fair, clear, not misleading (CySEC C108 + MiFID II onshored)
  {
    title: "CIF marketing communications must be fair, clear and not misleading (CySEC)",
    description: "CySEC Circular C108 and Law 87(I)/2017 — the Provision of Investment Services Law — require that all marketing communications by Cyprus Investment Firms be fair, clear and not misleading, with risks given equivalent prominence to benefits.",
    category: "fair_clear_not_misleading",
    severity: "major",
    sourceRefs: [
      { sourceCode: "CYSEC", documentRef: "CySEC Circular C108", quote: "Digital marketing standards for Cyprus Investment Firms" },
      { sourceCode: "CYSEC", documentRef: "Law 87(I)/2017 — Provision of Investment Services", quote: "Section 25 — marketing communications" },
    ],
    rules: [
      {
        ruleType: "semantic_check",
        severity: "major",
        config: {
          kind: "semantic_check",
          prompt: "Assess whether this MEXEM marketing communication is fair, clear and not misleading under CySEC standards (Circular C108, Law 87(I)/2017). Flag if it overstates benefits, omits material risks, or could mislead a retail investor about the nature of the product.",
        },
      },
    ],
  },

  // 2 — no guarantees / no risk-free claims (CySEC + ESMA convergence)
  {
    title: "CIFs must not present investments as guaranteed or risk-free (CySEC)",
    description: "CySEC's longstanding position — reinforced in multiple supervisory letters — prohibits any framing that implies guaranteed returns, risk-free trading, or capital protection where none exists. The standard applies cross-locale to all CIF promotions.",
    category: "no_guarantees",
    severity: "critical",
    sourceRefs: [
      { sourceCode: "CYSEC", documentRef: "CySEC Circular C108" },
      { sourceCode: "CYSEC", documentRef: "CySEC supervisory letters on retail marketing" },
    ],
    rules: [
      {
        ruleType: "banned_phrase",
        severity: "critical",
        config: {
          kind: "banned_phrase",
          // Cross-locale phrases — multi-language to apply uniformly across
          // every bundle that pulls in this overlay.
          phrases: [
            // EN
            "guaranteed returns",
            "guaranteed income",
            "risk-free trading",
            "no risk investment",
            "capital protection guaranteed",
            // IT
            "rendimento garantito CIF",
            "investimento sicuro CIF",
            // FR
            "rendement garanti CIF",
            // ES
            "rentabilidad garantizada CIF",
            // NL
            "gegarandeerd rendement CIF",
          ],
        },
      },
    ],
  },

  // 3 — capital-at-risk disclaimer at firm level (CySEC C108)
  {
    title: "Cross-locale capital-at-risk disclosure when performance is referenced (CySEC)",
    description: "Per CySEC Circular C108, any retail-facing communication that references performance, returns or gains must include a clear capital-at-risk warning regardless of the destination locale.",
    category: "risk_balance",
    severity: "major",
    sourceRefs: [
      { sourceCode: "CYSEC", documentRef: "CySEC Circular C108", quote: "Risk warning prominence requirements" },
    ],
    rules: [
      {
        ruleType: "required_disclaimer",
        severity: "major",
        config: {
          kind: "required_disclaimer",
          // English-language baseline — the per-locale national obligations
          // already require the same disclosure in the target language. This
          // overlay catches any English-language CIF promotion that bypassed
          // a national bundle.
          text: "Your capital is at risk.",
          triggers: [
            "return",
            "returns",
            "profit",
            "profits",
            "gain",
            "gains",
            "performance",
            "yield",
            "yields",
          ],
        },
      },
    ],
  },
];

interface LocaleTarget {
  localeCode: string;
  primary: string;
  overlays: string[];
}

const LOCALE_TARGETS: LocaleTarget[] = [
  { localeCode: "it-IT", primary: "IT", overlays: ["CY"] },
  { localeCode: "fr-FR", primary: "FR", overlays: ["CY"] },
  { localeCode: "nl-NL", primary: "NL", overlays: ["CY"] },
  { localeCode: "nl-BE", primary: "BE", overlays: ["CY"] },
  { localeCode: "fr-BE", primary: "BE", overlays: ["CY"] },
  { localeCode: "es-ES", primary: "ES", overlays: ["CY"] },
  // en-GB: GB primary + CY overlay (no EU baseline — UK no longer in
  // directly-applicable regime). MEXEM as a CIF must still meet CySEC
  // requirements for any UK promotion.
  { localeCode: "en-GB", primary: "GB", overlays: ["CY"] },
];

async function ensureObligation(seed: CySecSeed): Promise<{ id: number; created: boolean; rulesCreated: number }> {
  const existing = await prisma.complianceObligation.findFirst({ where: { title: seed.title } });

  if (existing) {
    let rulesCreated = 0;
    if (existing.status !== "approved") {
      await prisma.complianceObligation.update({
        where: { id: existing.id },
        data: { status: "approved", approvedBy: "cysec-overlay-seed", approvedAt: new Date() },
      });
    }
    const ruleCount = await prisma.complianceRule.count({ where: { obligationId: existing.id } });
    if (ruleCount === 0) {
      for (const r of seed.rules) {
        await prisma.complianceRule.create({
          data: {
            obligationId: existing.id,
            ruleType: r.ruleType,
            configJson: JSON.stringify(r.config),
            severity: r.severity ?? null,
            enabled: true,
          },
        });
        rulesCreated++;
      }
    }
    return { id: existing.id, created: false, rulesCreated };
  }

  const obl = await prisma.complianceObligation.create({
    data: {
      title: seed.title,
      description: seed.description,
      jurisdiction: "CY",
      localeCode: null,
      category: seed.category,
      severity: seed.severity,
      status: "approved",
      sourceRefsJson: JSON.stringify(seed.sourceRefs),
      createdBy: "cysec-overlay-seed",
      approvedBy: "cysec-overlay-seed",
      approvedAt: new Date(),
    },
  });
  let rulesCreated = 0;
  for (const r of seed.rules) {
    await prisma.complianceRule.create({
      data: {
        obligationId: obl.id,
        ruleType: r.ruleType,
        configJson: JSON.stringify(r.config),
        severity: r.severity ?? null,
        enabled: true,
      },
    });
    rulesCreated++;
  }
  return { id: obl.id, created: true, rulesCreated };
}

async function recompileWithOverlay(target: LocaleTarget): Promise<{ bundleId: number; supersededId?: number; jurisdictions: string[]; ruleCount: number; obligationCount: number; skipped: boolean }> {
  const existing = await prisma.ruleBundle.findUnique({
    where: { localeCode_version: { localeCode: target.localeCode, version: NEW_VERSION } },
  });
  if (existing) {
    return { bundleId: existing.id, jurisdictions: [], ruleCount: 0, obligationCount: 0, skipped: true };
  }

  const compile = await compileDraftBundle({
    localeCode: target.localeCode,
    jurisdiction: target.primary,
    overlays: target.overlays,
    version: NEW_VERSION,
    compiledBy: "cysec-overlay-seed",
    notes: `${target.primary} primary + CY overlay (CySEC licensing-regulator rules).`,
  });
  const pub = await publishBundle(compile.bundleId, "cysec-overlay-seed");

  return {
    bundleId: compile.bundleId,
    supersededId: pub.supersededBundleId ?? undefined,
    jurisdictions: compile.jurisdictionsApplied,
    ruleCount: compile.ruleCount,
    obligationCount: compile.obligationCount,
    skipped: false,
  };
}

async function main() {
  console.log("Seeding CySEC overlay obligations + recompiling every locale bundle to v1.2.0...\n");

  // ── 1. Obligations ───────────────────────────────────────────────
  let created = 0;
  let reused = 0;
  let rulesCreated = 0;
  for (const seed of CYSEC_SEEDS) {
    const r = await ensureObligation(seed);
    if (r.created) {
      created++;
      console.log(`  ✓ CySEC obligation created (id=${r.id}, rules=${r.rulesCreated}): ${seed.category}`);
    } else {
      reused++;
      console.log(`  ↻ CySEC obligation already existed (id=${r.id}): ${seed.category}`);
    }
    rulesCreated += r.rulesCreated;
  }
  console.log();
  console.log(`Obligations: ${created} created, ${reused} reused. Rules created: ${rulesCreated}.\n`);

  // ── 2. Recompile every locale bundle with the CY overlay ─────────
  console.log("Bundles:");
  for (const target of LOCALE_TARGETS) {
    try {
      const result = await recompileWithOverlay(target);
      if (result.skipped) {
        console.log(`  ↻ ${target.localeCode}@${NEW_VERSION} already exists (id=${result.bundleId}) — skipping`);
      } else {
        console.log(
          `  ✓ ${target.localeCode}@${NEW_VERSION} published (id=${result.bundleId}, ` +
          `composition=[${result.jurisdictions.join("+")}], obligations=${result.obligationCount}, rules=${result.ruleCount}` +
          (result.supersededId ? `, superseded=${result.supersededId}` : "") + ")",
        );
      }
    } catch (err: any) {
      console.log(`  ✖ ${target.localeCode}@${NEW_VERSION} failed: ${err.message}`);
    }
  }

  console.log();
  console.log("Done. Every published bundle now includes CySEC source-refs + cross-locale CIF rules.");
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
