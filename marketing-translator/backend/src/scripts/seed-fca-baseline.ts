/**
 * Seed FCA baseline — authoring phase for the UK compliance source-of-truth.
 *
 * Creates:
 *  - 5 ComplianceObligation entries with jurisdiction="GB", citing FCA Handbook (COBS 4)
 *  - Per-obligation rules (banned_phrase, required_disclaimer, semantic_check)
 *  - Published RuleBundle v1.0.0 for en-GB (GB primary, no EU overlay —
 *    UK left the EU directly-applicable regime; MiFID II equivalence is
 *    onshored via UK MiFIR and COBS, so EU baseline is NOT layered in)
 *
 * Idempotent: re-runs reuse existing obligations (by title) and skip an
 * already-published en-GB bundle.
 *
 * Run: npx tsx src/scripts/seed-fca-baseline.ts
 */

import { prisma } from "../db";
import { compileDraftBundle } from "../compliance/bundles/compiler";
import { publishBundle } from "../compliance/bundles/publisher";

const VERSION = "1.0.0";
const LOCALE = "en-GB";
const JURISDICTION = "GB";

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
  // 1 — fair, clear, not misleading (COBS 4.2)
  {
    title: "Financial promotions must be fair, clear and not misleading (UK FCA)",
    description: "FCA COBS 4.2.1R — a firm must ensure that a communication or financial promotion is fair, clear and not misleading. This is the cornerstone rule for all UK retail-investor marketing.",
    category: "fair_clear_not_misleading",
    severity: "major",
    sourceRefs: [
      { sourceCode: "FCA", documentRef: "COBS 4.2.1R", quote: "A firm must ensure that a communication or a financial promotion is fair, clear and not misleading." },
    ],
    rules: [
      {
        ruleType: "semantic_check",
        severity: "major",
        config: {
          kind: "semantic_check",
          prompt: "Assess whether this UK-targeted financial promotion is fair, clear and not misleading (FCA COBS 4.2). Flag if it overstates benefits, omits material risks, uses ambiguous phrasing that obscures the product, or could mislead a retail investor.",
        },
      },
    ],
  },

  // 2 — no guarantees of returns (COBS 4.5)
  {
    title: "No guaranteed returns, capital safety or risk-free claims (UK FCA)",
    description: "FCA COBS 4.5.2R prohibits any communication that creates a false impression that an investment is risk-free, guaranteed, or capital-protected when it is not. Applies across all UK retail financial promotions.",
    category: "no_guarantees",
    severity: "critical",
    sourceRefs: [
      { sourceCode: "FCA", documentRef: "COBS 4.5.2R", quote: "Communications must not disguise, diminish or obscure important warnings, statements or information." },
      { sourceCode: "FCA", documentRef: "COBS 4.6.2R", quote: "Past performance must not be the most prominent feature of the promotion." },
    ],
    rules: [
      {
        ruleType: "banned_phrase",
        severity: "critical",
        config: {
          kind: "banned_phrase",
          phrases: [
            "guaranteed returns",
            "guaranteed profit",
            "guaranteed gains",
            "assured profits",
            "assured returns",
            "risk-free",
            "risk free",
            "no risk",
            "100% safe",
            "completely safe",
            "capital protected",
            "capital guarantee",
            "guaranteed income",
            "certain gains",
            "get rich",
            "get-rich",
            "financial freedom guaranteed",
          ],
        },
      },
    ],
  },

  // 3 — risk balance / capital-at-risk disclaimer (COBS 4.5 + 4.6)
  {
    title: "Capital-at-risk disclosure required when promoting performance or returns (UK FCA)",
    description: "FCA COBS 4.5 + 4.6 require that when a financial promotion mentions returns, performance or potential gains, a clear capital-at-risk warning must accompany it with equivalent prominence.",
    category: "risk_balance",
    severity: "major",
    sourceRefs: [
      { sourceCode: "FCA", documentRef: "COBS 4.5.2R", quote: "Information must not disguise, diminish or obscure important warnings." },
      { sourceCode: "FCA", documentRef: "COBS 4.6.7G", quote: "Risk warnings should be presented in a way which is likely to be understood by the average member of the group to whom it is directed." },
    ],
    rules: [
      {
        ruleType: "required_disclaimer",
        severity: "major",
        config: {
          kind: "required_disclaimer",
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
            "growth",
            "earn",
            "earnings",
          ],
        },
      },
    ],
  },

  // 4 — past performance disclaimer (COBS 4.6)
  {
    title: "Past performance disclaimer required when historical performance is referenced (UK FCA)",
    description: "FCA COBS 4.6.2R + 4.6.7G require a clear statement that past performance is not a reliable indicator of future results whenever historical or past performance is referenced in a UK retail promotion.",
    category: "past_performance",
    severity: "major",
    sourceRefs: [
      { sourceCode: "FCA", documentRef: "COBS 4.6.2R", quote: "Past performance must not be the most prominent feature of the promotion, and must be accompanied by a prominent warning." },
      { sourceCode: "FCA", documentRef: "COBS 4.6.7G" },
    ],
    rules: [
      {
        ruleType: "required_disclaimer",
        severity: "major",
        config: {
          kind: "required_disclaimer",
          text: "Past performance is not a reliable indicator of future results.",
          triggers: [
            "past performance",
            "historical return",
            "historical returns",
            "last year",
            "annual return",
            "annual returns",
            "track record",
            "year-to-date",
            "since inception",
            "ytd",
          ],
        },
      },
    ],
  },

  // 5 — no personalised investment advice (COBS 9 + Perimeter Guidance)
  {
    title: "Marketing must not constitute personalised investment advice (UK FCA)",
    description: "Per COBS 9 and the FCA Perimeter Guidance, providing a personal recommendation is a regulated activity. Marketing communications must not phrase themselves as personal recommendations to buy, sell or hold a specific investment.",
    category: "no_financial_advice",
    severity: "major",
    sourceRefs: [
      { sourceCode: "FCA", documentRef: "COBS 9 — Suitability" },
      { sourceCode: "FCA", documentRef: "PERG 8 — Financial promotion and related activities" },
    ],
    rules: [
      {
        ruleType: "banned_phrase",
        severity: "major",
        config: {
          kind: "banned_phrase",
          phrases: [
            "you should invest",
            "you should buy",
            "we recommend buying",
            "we advise you to",
            "this is a buy",
            "this is a strong buy",
            "you must invest",
            "now is the time to buy",
            "right time to invest",
          ],
        },
      },
      {
        ruleType: "semantic_check",
        severity: "major",
        config: {
          kind: "semantic_check",
          prompt: "Does this UK promotion constitute a personal recommendation under FCA PERG 8 (advice on the merits of buying or selling a specific investment to a specific person)? Flag if the framing implies a tailored recommendation rather than generic information.",
        },
      },
    ],
  },
];

async function main() {
  console.log("Seeding FCA baseline obligations + rules + en-GB bundle...\n");

  // ── 0. Verify FCA source exists ──────────────────────────────────
  const fca = await prisma.regulatorySource.findUnique({ where: { code: "FCA" } });
  if (!fca) {
    throw new Error("FCA registry row missing. Run db:seed:sources first.");
  }
  const fcaDocs = await prisma.sourceDocument.count({ where: { sourceId: fca.id } });
  console.log(`  FCA: ${fcaDocs} document(s) available in DB`);
  if (fcaDocs === 0) {
    console.log("  ⚠  No FCA documents found. The bundle will still publish (compiler only reads obligations).");
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

      if (existing.status !== "approved") {
        await prisma.complianceObligation.update({
          where: { id: existing.id },
          data: { status: "approved", approvedBy: "fca-baseline-seed", approvedAt: new Date() },
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
          createdRules++;
        }
      }
      continue;
    }

    const obl = await prisma.complianceObligation.create({
      data: {
        title: seed.title,
        description: seed.description,
        jurisdiction: JURISDICTION,
        localeCode: LOCALE,
        category: seed.category,
        severity: seed.severity,
        status: "approved",
        sourceRefsJson: JSON.stringify(seed.sourceRefs),
        createdBy: "fca-baseline-seed",
        approvedBy: "fca-baseline-seed",
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

  // ── 2. Compile + publish en-GB bundle ────────────────────────────
  console.log("Bundle:");
  const existing = await prisma.ruleBundle.findUnique({
    where: { localeCode_version: { localeCode: LOCALE, version: VERSION } },
  });

  if (existing) {
    console.log(`  ↻ ${LOCALE}@${VERSION} already exists (status=${existing.status}) — skipping`);
  } else {
    const compile = await compileDraftBundle({
      localeCode: LOCALE,
      jurisdiction: JURISDICTION,
      version: VERSION,
      compiledBy: "fca-baseline-seed",
      notes: "UK FCA baseline — COBS 4.2/4.5/4.6 + COBS 9 / PERG 8. Auto-seeded.",
    });
    const pub = await publishBundle(compile.bundleId, "fca-baseline-seed");
    console.log(
      `  ✓ ${LOCALE}@${VERSION} published (id=${compile.bundleId}, obligations=${compile.obligationCount}, rules=${compile.ruleCount}${pub.supersededBundleId ? `, superseded=${pub.supersededBundleId}` : ""})`,
    );
  }

  console.log();
  console.log("═══ Summary ═══");
  console.log(`Obligations: ${OBLIGATIONS.length} total (${createdObligations} new, ${reusedObligations} reused)`);
  console.log(`Rules:       ${createdRules} new`);
  console.log(`Bundle:      ${LOCALE}@${VERSION}`);
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
