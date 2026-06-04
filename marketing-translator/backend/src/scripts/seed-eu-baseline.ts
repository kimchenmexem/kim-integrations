/**
 * Seed EU baseline — authoring phase for compliance source-of-truth.
 *
 * Creates:
 *  - 6 ComplianceObligation entries citing EUR_LEX + ESMA documents
 *  - Minimal set of rules per obligation (banned_phrase, required_disclaimer, semantic_check)
 *  - Published RuleBundle v1.0.0 per EU locale (excluding en-GB — FCA bundle is untouched)
 *
 * Idempotent: re-runs reuse existing obligations (by title) and skip bundles that already exist.
 * Does NOT change ingestion logic.
 *
 * Run: npm --workspace backend run seed:eu-baseline
 */

import { prisma } from "../db";
import { compileDraftBundle } from "../compliance/bundles/compiler";
import { publishBundle } from "../compliance/bundles/publisher";

const VERSION = "1.0.0";
const EU_LOCALES = ["it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES"] as const;

interface SeedObligation {
  title: string;
  description: string;
  category: string;
  severity: "critical" | "major" | "minor";
  sourceRefs: Array<{ sourceCode: string; documentRef?: string; quote?: string }>;
  rules: Array<{
    ruleType: "banned_phrase" | "regex" | "required_disclaimer" | "semantic_check";
    config: Record<string, unknown>;
    severity?: "critical" | "major" | "minor";
  }>;
}

const OBLIGATIONS: SeedObligation[] = [
  // 1 — no guarantees
  {
    title: "No guarantees of returns or capital safety (EU)",
    description: "Marketing communications must not state or imply guaranteed returns, profits, capital preservation, or risk-free investing. Applies across all EU locales.",
    category: "no_guarantees",
    severity: "critical",
    sourceRefs: [
      { sourceCode: "EUR_LEX", documentRef: "MiFID II (Directive 2014/65/EU)", quote: "Article 24(3) — communications must be fair, clear and not misleading" },
      { sourceCode: "ESMA", documentRef: "ESMA-2022-marketing-comms" },
    ],
    rules: [
      {
        ruleType: "banned_phrase",
        severity: "critical",
        config: {
          kind: "banned_phrase",
          phrases: [
            // EN
            "guaranteed returns", "assured profits", "risk-free", "100% safe", "no risk",
            // FR
            "rendement garanti", "profit assuré", "sans risque",
            // IT
            "rendimento garantito", "profitto assicurato", "senza rischio",
            // ES
            "rentabilidad garantizada", "sin riesgo",
            // NL
            "gegarandeerd rendement", "risicovrij"
          ]
        }
      }
    ]
  },

  // 2 — fair, clear, not misleading
  {
    title: "Communications must be fair, clear and not misleading (EU)",
    description: "Per MiFID II Article 24(3), all communications to clients and potential clients must be fair, clear, and not misleading.",
    category: "fair_clear_not_misleading",
    severity: "major",
    sourceRefs: [
      { sourceCode: "EUR_LEX", documentRef: "MiFID II (Directive 2014/65/EU)", quote: "Article 24(3)" }
    ],
    rules: [
      {
        ruleType: "semantic_check",
        severity: "major",
        config: {
          kind: "semantic_check",
          prompt: "Assess whether this text is fair, clear and not misleading. Flag if it overstates benefits, omits material risks, or creates false impressions about the nature or behaviour of the financial product."
        }
      }
    ]
  },

  // 3 — risk balance
  {
    title: "Benefits must be balanced with proportionate risk disclosure (EU)",
    description: "When marketing mentions performance, returns, or investment outcomes, a proportionate capital-at-risk disclosure must accompany it.",
    category: "risk_balance",
    severity: "major",
    sourceRefs: [
      { sourceCode: "EUR_LEX", documentRef: "MiFID II Delegated Reg. 2017/565", quote: "Article 44 — fair, clear, not misleading information" },
      { sourceCode: "ESMA", documentRef: "ESMA35-43-349", quote: "Balanced presentation of risks and benefits" }
    ],
    rules: [
      {
        ruleType: "required_disclaimer",
        severity: "major",
        config: {
          kind: "required_disclaimer",
          text: "Capital is at risk.",
          triggers: [
            "return", "returns", "profit", "profits", "gain", "gains", "performance",
            "rendement", "profitto", "rendimento", "rentabilidad", "ganancia"
          ]
        }
      }
    ]
  },

  // 4 — marketing identifiable
  {
    title: "Marketing communications must be clearly identifiable (EU)",
    description: "Per MiFID II Article 24(3) and Delegated Regulation 2017/565 Article 44, marketing communications must be clearly identifiable as marketing.",
    category: "marketing_identifiable",
    severity: "minor",
    sourceRefs: [
      { sourceCode: "EUR_LEX", documentRef: "MiFID II Delegated Reg. 2017/565", quote: "Article 44 — identifiability of marketing communications" }
    ],
    rules: [
      {
        ruleType: "semantic_check",
        severity: "minor",
        config: {
          kind: "semantic_check",
          prompt: "Is the text clearly identifiable as a marketing communication rather than neutral information or personalised advice? Flag only if the framing is misleading about this."
        }
      }
    ]
  },

  // 5 — no financial advice
  {
    title: "Marketing must not constitute personalised investment advice (EU)",
    description: "Marketing communications must not frame themselves as personalised investment recommendations. Investment advice is a regulated activity under MiFID II requiring a separate channel.",
    category: "no_financial_advice",
    severity: "major",
    sourceRefs: [
      { sourceCode: "EUR_LEX", documentRef: "MiFID II (Directive 2014/65/EU)", quote: "Article 24(4) — investment advice definition" },
      { sourceCode: "ESMA", documentRef: "ESMA35-43-349" }
    ],
    rules: [
      {
        ruleType: "banned_phrase",
        severity: "major",
        config: {
          kind: "banned_phrase",
          phrases: [
            // EN
            "you should invest", "we recommend buying", "we advise you to", "this is a buy",
            // FR
            "vous devriez investir", "nous recommandons d'acheter",
            // IT
            "dovresti investire", "ti consigliamo di comprare",
            // ES
            "debería invertir", "le recomendamos comprar",
            // NL
            "u zou moeten beleggen"
          ]
        }
      }
    ]
  },

  // 6 — disclosure consistency (past performance)
  {
    title: "Past performance disclosure consistency (EU)",
    description: "When past performance is referenced, a past-performance-is-not-indicative-of-future-results disclosure must be included consistently.",
    category: "disclosure_consistency",
    severity: "major",
    sourceRefs: [
      { sourceCode: "ESMA", documentRef: "ESMA35-43-349", quote: "Past performance disclosure guidance" },
      { sourceCode: "EUR_LEX", documentRef: "MiFID II Delegated Reg. 2017/565" }
    ],
    rules: [
      {
        ruleType: "required_disclaimer",
        severity: "major",
        config: {
          kind: "required_disclaimer",
          text: "Past performance is not a reliable indicator of future results.",
          triggers: [
            "past performance", "historical return", "last year", "annual return",
            "performance passée", "performances passées",
            "performance passate", "rendimento passato",
            "rendimiento pasado", "resultados pasados",
            "resultaten in het verleden"
          ]
        }
      }
    ]
  },
];

async function main() {
  console.log("Seeding EU baseline obligations + rules + bundles...\n");

  // ── 0. Verify EUR_LEX and ESMA sources + documents exist ─────────
  const eur = await prisma.regulatorySource.findUnique({ where: { code: "EUR_LEX" } });
  const esma = await prisma.regulatorySource.findUnique({ where: { code: "ESMA" } });
  if (!eur || !esma) {
    throw new Error("EUR_LEX or ESMA registry row missing. Run db:seed:sources first.");
  }
  const eurDocs = await prisma.sourceDocument.count({ where: { sourceId: eur.id } });
  const esmaDocs = await prisma.sourceDocument.count({ where: { sourceId: esma.id } });
  console.log(`  EUR_LEX: ${eurDocs} document(s) available in DB`);
  console.log(`  ESMA:    ${esmaDocs} document(s) available in DB`);
  if (eurDocs === 0 || esmaDocs === 0) {
    console.log("  ⚠  No documents found. Run `npm --workspace backend run compliance:sync` first.");
  }
  console.log();

  // ── 1. Obligations + rules ───────────────────────────────────────
  let createdObligations = 0;
  let reusedObligations = 0;
  let createdRules = 0;

  for (const seed of OBLIGATIONS) {
    const existing = await prisma.complianceObligation.findFirst({ where: { title: seed.title } });

    if (existing) {
      reusedObligations++;
      console.log(`  ↻ obligation exists: "${seed.title}" (id=${existing.id}, status=${existing.status})`);

      // Ensure approved so the compiler picks it up
      if (existing.status !== "approved") {
        await prisma.complianceObligation.update({
          where: { id: existing.id },
          data: { status: "approved", approvedBy: "eu-baseline-seed", approvedAt: new Date() },
        });
      }

      // Only add rules if none exist for this obligation
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
          createdRules++;
        }
      }
      continue;
    }

    const obl = await prisma.complianceObligation.create({
      data: {
        title: seed.title,
        description: seed.description,
        jurisdiction: "EU",
        localeCode: null,
        category: seed.category,
        severity: seed.severity,
        status: "approved",
        sourceRefsJson: JSON.stringify(seed.sourceRefs),
        createdBy: "eu-baseline-seed",
        approvedBy: "eu-baseline-seed",
        approvedAt: new Date(),
      },
    });
    createdObligations++;
    console.log(`  ✓ obligation created: "${seed.title}" (id=${obl.id})`);

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
      createdRules++;
    }
  }

  console.log();
  console.log(`Obligations: ${createdObligations} created, ${reusedObligations} reused. Rules: ${createdRules} created.\n`);

  // ── 2. Compile + publish bundles per EU locale (excl. en-GB) ─────
  console.log("Bundles:");
  const bundleResults: Array<{ locale: string; status: string; note?: string }> = [];

  for (const locale of EU_LOCALES) {
    const existing = await prisma.ruleBundle.findUnique({
      where: { localeCode_version: { localeCode: locale, version: VERSION } },
    });

    if (existing) {
      bundleResults.push({ locale, status: existing.status, note: "already exists" });
      console.log(`  ↻ ${locale}@${VERSION} already exists (status=${existing.status}) — skipping`);
      continue;
    }

    try {
      const compile = await compileDraftBundle({
        localeCode: locale,
        jurisdiction: "EU",
        version: VERSION,
        compiledBy: "eu-baseline-seed",
        notes: "EU baseline — EUR_LEX + ESMA reference. Auto-seeded.",
      });
      const pub = await publishBundle(compile.bundleId, "eu-baseline-seed");
      bundleResults.push({
        locale,
        status: "published",
        note: `id=${compile.bundleId}, obligations=${compile.obligationCount}, rules=${compile.ruleCount}${pub.supersededBundleId ? `, superseded=${pub.supersededBundleId}` : ""}`,
      });
      console.log(`  ✓ ${locale}@${VERSION} published (obligations=${compile.obligationCount}, rules=${compile.ruleCount})`);
    } catch (err: any) {
      bundleResults.push({ locale, status: "failed", note: err.message });
      console.log(`  ✖ ${locale}@${VERSION}: ${err.message}`);
    }
  }

  console.log();
  console.log("═══ Summary ═══");
  console.log(`Obligations: ${OBLIGATIONS.length} total (${createdObligations} newly created, ${reusedObligations} reused)`);
  console.log(`Rules:       ${createdRules} newly created`);
  console.log(`Bundles:`);
  for (const b of bundleResults) {
    console.log(`  ${b.locale.padEnd(8)} ${b.status.padEnd(10)} ${b.note ?? ""}`);
  }
  console.log();
  console.log("Note: en-GB FCA bundle intentionally untouched.");
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
