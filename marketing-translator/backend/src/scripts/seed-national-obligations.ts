/**
 * Seed national-regulator obligations.
 *
 * Adds 6 country-specific ComplianceObligation rows on top of the EU baseline:
 *  - it-IT (CONSOB)
 *  - fr-FR (AMF)
 *  - nl-NL (AFM)
 *  - nl-BE (FSMA)
 *  - fr-BE (FSMA)
 *  - es-ES (CNMV)
 *
 * Each obligation:
 *  - jurisdiction = country code (IT/FR/NL/BE/ES)
 *  - localeCode   = the country's locale (so it compiles into THAT locale's
 *                   bundle alongside the EU baseline)
 *  - sourceRefs   = the national regulator's identifier + key document
 *  - rules        = language-specific banned phrases + national-disclaimer
 *
 * After seeding, the previously-published v1.0.0 bundles are RE-COMPILED as
 * v1.1.0 so the new obligations actually reach runtime. The old v1.0.0 rows
 * are superseded (status="superseded") automatically by publishBundle().
 *
 * en-GB is intentionally untouched — its FCA bundle is already authoritative.
 *
 * Idempotent: re-runs reuse obligations by title and skip already-existing
 * v1.1.0 bundles.
 *
 * Run: npm --workspace backend run seed:national-obligations
 */

import { prisma } from "../db";
import { compileDraftBundle } from "../compliance/bundles/compiler";
import { publishBundle } from "../compliance/bundles/publisher";

const NEW_VERSION = "1.1.0";

interface NationalSeed {
  /** Country code — also the jurisdiction filter the compiler uses. */
  jurisdiction: string;
  /** Specific locale this obligation targets. */
  localeCode: string;
  /** Display name of the national regulator. */
  regulator: string;
  /** Title of the single obligation we create for this country. */
  title: string;
  description: string;
  category: string;
  sourceRefs: Array<{ sourceCode: string; documentRef?: string; quote?: string }>;
  /** Language-specific banned phrases sourced from jurisdictionRules.ts. */
  bannedPhrases: string[];
  /** Country-specific risk-warning text. */
  riskWarningDisclaimer: string;
  /** Triggers that should fire the risk-warning requirement. */
  riskTriggers: string[];
}

const NATIONAL_SEEDS: NationalSeed[] = [
  // ── ITALY — CONSOB ────────────────────────────────────────────────
  {
    jurisdiction: "IT",
    localeCode: "it-IT",
    regulator: "CONSOB",
    title: "CONSOB national marketing-conduct rules for retail financial promotions (IT)",
    description: "CONSOB Regolamento Intermediari and CONSOB pubblicità rules set Italian-specific standards on top of the EU MiFID II baseline: language must be clear, no unrealistic expectations of returns, and every benefit claim must be balanced with an explicit Italian-language capital-loss disclosure.",
    category: "national_marketing_conduct",
    sourceRefs: [
      { sourceCode: "CONSOB", documentRef: "Regolamento Intermediari", quote: "Art. 36 — informazione corretta, chiara e non fuorviante" },
      { sourceCode: "CONSOB", documentRef: "Comunicazione su pubblicità prodotti finanziari" },
    ],
    bannedPhrases: [
      "guadagno facile",
      "guadagno garantito",
      "investimento sicuro al 100%",
      "ricco velocemente",
      "diventare ricco",
      "libertà finanziaria",
      "offerta limitata",
      "agisci ora",
      "non perdere questa opportunità",
      "il migliore",
      "rivoluzionario",
      "straordinario",
      "dovresti investire adesso",
      "è il momento giusto per investire",
    ],
    riskWarningDisclaimer:
      "Gli investimenti comportano rischi, inclusa la possibile perdita del capitale investito.",
    riskTriggers: ["rendimento", "profitto", "guadagno", "performance"],
  },

  // ── FRANCE — AMF ──────────────────────────────────────────────────
  {
    jurisdiction: "FR",
    localeCode: "fr-FR",
    regulator: "AMF",
    title: "AMF national marketing-conduct rules for retail financial promotions (FR)",
    description: "AMF Position DOC-2013-12 and AMF Recommendation DOC-2011-24 set French-specific standards: every benefit claim must be immediately balanced with capital-loss disclosure, comparative advertising requires substantiated data, and past-performance disclaimers must use the AMF-prescribed wording.",
    category: "national_marketing_conduct",
    sourceRefs: [
      { sourceCode: "AMF", documentRef: "AMF Position DOC-2013-12", quote: "Communications publicitaires sur les instruments financiers" },
      { sourceCode: "AMF", documentRef: "AMF Recommendation DOC-2011-24" },
    ],
    bannedPhrases: [
      "gains rapides",
      "devenez riche",
      "argent facile",
      "placement sans risque",
      "rendement assuré",
      "profit garanti",
      "liberté financière",
      "offre limitée",
      "agissez maintenant",
      "ne manquez pas",
      "le meilleur",
      "extraordinaire",
      "révolutionnaire",
      "vous devriez investir",
      "c'est le bon moment pour investir",
    ],
    riskWarningDisclaimer:
      "Les investissements comportent des risques, y compris la perte partielle ou totale du capital investi.",
    riskTriggers: ["rendement", "profit", "gain", "performance"],
  },

  // ── NETHERLANDS — AFM ─────────────────────────────────────────────
  {
    jurisdiction: "NL",
    localeCode: "nl-NL",
    regulator: "AFM",
    title: "AFM national marketing-conduct rules for retail financial promotions (NL)",
    description: "AFM Beleidsregel Informatieverstrekking sets Dutch-specific standards: language must be sober and measurable, no unrealistic expectations of returns, and every promotion of an investment product must include the Dutch capital-at-risk disclosure.",
    category: "national_marketing_conduct",
    sourceRefs: [
      { sourceCode: "AFM", documentRef: "Beleidsregel Informatieverstrekking 2018", quote: "Informatie moet correct, duidelijk en niet misleidend zijn" },
    ],
    bannedPhrases: [
      "snel rijk worden",
      "geld verdienen zonder risico",
      "verzekerd rendement",
      "gegarandeerd winst",
      "financiële vrijheid",
      "beperkte tijd",
      "handel nu",
      "mis dit niet",
      "de beste",
      "nummer één",
      "buitengewoon",
      "u zou moeten beleggen",
      "dit is het juiste moment",
    ],
    riskWarningDisclaimer:
      "Beleggen kent risico's. De waarde van uw belegging kan fluctueren. In het verleden behaalde resultaten bieden geen garantie voor de toekomst.",
    riskTriggers: ["rendement", "winst", "opbrengst", "groei"],
  },

  // ── BELGIUM (Dutch) — FSMA ────────────────────────────────────────
  {
    jurisdiction: "BE",
    localeCode: "nl-BE",
    regulator: "FSMA",
    title: "FSMA national marketing-conduct rules for Dutch-language Belgian promotions (BE-NL)",
    description: "FSMA national rules on marketing communications: information must be exact, clear and not misleading, with national-specific banned phrases in Belgian Dutch and a Flemish capital-loss disclosure.",
    category: "national_marketing_conduct",
    sourceRefs: [
      { sourceCode: "FSMA", documentRef: "FSMA Mededeling — Reclame voor financiële producten", quote: "Reclameboodschappen moeten correct, duidelijk en niet misleidend zijn" },
      { sourceCode: "BE_FSMA", documentRef: "Loi du 2 août 2002 — surveillance secteur financier" },
    ],
    bannedPhrases: [
      "snel rijk worden",
      "gegarandeerd rendement",
      "beleggen zonder risico",
      "financiële vrijheid",
      "beperkte tijd",
      "handel nu",
      "de beste",
      "u zou moeten beleggen",
    ],
    riskWarningDisclaimer:
      "Beleggen brengt risico's met zich mee, inclusief het mogelijke verlies van het belegde kapitaal.",
    riskTriggers: ["rendement", "winst", "opbrengst"],
  },

  // ── BELGIUM (French) — FSMA ───────────────────────────────────────
  {
    jurisdiction: "BE",
    localeCode: "fr-BE",
    regulator: "FSMA",
    title: "FSMA national marketing-conduct rules for French-language Belgian promotions (BE-FR)",
    description: "FSMA national rules on marketing communications: information must be exact, clear and not misleading, with national-specific banned phrases in Belgian French and a Belgian-French capital-loss disclosure.",
    category: "national_marketing_conduct",
    sourceRefs: [
      { sourceCode: "FSMA", documentRef: "FSMA Communication — Publicité pour produits financiers", quote: "Les communications publicitaires doivent être exactes, claires et non trompeuses" },
      { sourceCode: "BE_FSMA", documentRef: "Loi du 2 août 2002 — surveillance secteur financier" },
    ],
    bannedPhrases: [
      "devenez riche rapidement",
      "rendement garanti",
      "investissement sans risque",
      "liberté financière",
      "offre limitée",
      "agissez maintenant",
      "le meilleur",
      "vous devriez investir",
    ],
    riskWarningDisclaimer:
      "Les investissements comportent des risques, y compris la perte partielle ou totale du capital investi.",
    riskTriggers: ["rendement", "profit", "gain"],
  },

  // ── SPAIN — CNMV ──────────────────────────────────────────────────
  {
    jurisdiction: "ES",
    localeCode: "es-ES",
    regulator: "CNMV",
    title: "CNMV national marketing-conduct rules for retail financial promotions (ES)",
    description: "CNMV Circular 1/2018 (Norma 9 — publicidad de productos de inversión) sets Spanish-specific standards: messages must be clear, balanced and not create unrealistic expectations, with the CNMV-prescribed Spanish risk-warning disclosure.",
    category: "national_marketing_conduct",
    sourceRefs: [
      { sourceCode: "CNMV", documentRef: "Circular 1/2018, Norma 9", quote: "Publicidad de productos y servicios de inversión" },
      { sourceCode: "CNMV", documentRef: "Real Decreto 217/2008" },
    ],
    bannedPhrases: [
      "ganar dinero fácil",
      "rentabilidad asegurada",
      "100% seguro",
      "sin pérdidas posibles",
      "duplicar tu dinero",
      "hazte rico",
      "libertad financiera",
      "oferta limitada",
      "actúa ahora",
      "no te lo pierdas",
      "el mejor",
      "número uno",
      "revolucionario",
      "deberías invertir",
      "es el momento de invertir",
    ],
    riskWarningDisclaimer:
      "La inversión en mercados financieros conlleva riesgos, incluida la posible pérdida total o parcial del capital invertido. Rentabilidades pasadas no garantizan rentabilidades futuras.",
    riskTriggers: ["rentabilidad", "ganancia", "beneficio", "rendimiento"],
  },
];

async function ensureObligation(seed: NationalSeed): Promise<{ id: number; created: boolean; rulesCreated: number }> {
  const existing = await prisma.complianceObligation.findFirst({ where: { title: seed.title } });

  if (existing) {
    let rulesCreated = 0;
    if (existing.status !== "approved") {
      await prisma.complianceObligation.update({
        where: { id: existing.id },
        data: { status: "approved", approvedBy: "national-obligations-seed", approvedAt: new Date() },
      });
    }
    const ruleCount = await prisma.complianceRule.count({ where: { obligationId: existing.id } });
    if (ruleCount === 0) {
      await createRulesFor(existing.id, seed);
      rulesCreated = 2;
    }
    return { id: existing.id, created: false, rulesCreated };
  }

  const obl = await prisma.complianceObligation.create({
    data: {
      title: seed.title,
      description: seed.description,
      jurisdiction: seed.jurisdiction,
      localeCode: seed.localeCode,
      category: seed.category,
      severity: "major",
      status: "approved",
      sourceRefsJson: JSON.stringify(seed.sourceRefs),
      createdBy: "national-obligations-seed",
      approvedBy: "national-obligations-seed",
      approvedAt: new Date(),
    },
  });
  await createRulesFor(obl.id, seed);
  return { id: obl.id, created: true, rulesCreated: 2 };
}

async function createRulesFor(obligationId: number, seed: NationalSeed): Promise<void> {
  // Rule 1 — language-specific banned phrases
  await prisma.complianceRule.create({
    data: {
      obligationId,
      ruleType: "banned_phrase",
      configJson: JSON.stringify({
        kind: "banned_phrase",
        phrases: seed.bannedPhrases,
      }),
      severity: "major",
      enabled: true,
    },
  });
  // Rule 2 — national-language risk disclaimer
  await prisma.complianceRule.create({
    data: {
      obligationId,
      ruleType: "required_disclaimer",
      configJson: JSON.stringify({
        kind: "required_disclaimer",
        text: seed.riskWarningDisclaimer,
        triggers: seed.riskTriggers,
      }),
      severity: "major",
      enabled: true,
    },
  });
}

async function recompileBundle(localeCode: string, jurisdiction: string): Promise<{ bundleId: number; supersededId?: number; ruleCount: number; obligationCount: number }> {
  const existing = await prisma.ruleBundle.findUnique({
    where: { localeCode_version: { localeCode, version: NEW_VERSION } },
  });
  if (existing) {
    return { bundleId: existing.id, ruleCount: 0, obligationCount: 0 };
  }

  const compile = await compileDraftBundle({
    localeCode,
    jurisdiction,
    version: NEW_VERSION,
    compiledBy: "national-obligations-seed",
    notes: `${jurisdiction} primary + EU baseline — adds national-regulator obligations.`,
  });
  const pub = await publishBundle(compile.bundleId, "national-obligations-seed");

  return {
    bundleId: compile.bundleId,
    supersededId: pub.supersededBundleId ?? undefined,
    ruleCount: compile.ruleCount,
    obligationCount: compile.obligationCount,
  };
}

async function main() {
  console.log("Seeding national-regulator obligations + recompiling bundles to v1.1.0...\n");

  // ── 1. Obligations ───────────────────────────────────────────────
  let created = 0;
  let reused = 0;
  let rulesCreated = 0;
  for (const seed of NATIONAL_SEEDS) {
    const r = await ensureObligation(seed);
    if (r.created) {
      created++;
      console.log(`  ✓ ${seed.regulator} obligation created (id=${r.id}, locale=${seed.localeCode}, banned=${seed.bannedPhrases.length})`);
    } else {
      reused++;
      console.log(`  ↻ ${seed.regulator} obligation already existed (id=${r.id})`);
    }
    rulesCreated += r.rulesCreated;
  }
  console.log();
  console.log(`Obligations: ${created} created, ${reused} reused. Rules: ${rulesCreated} created.\n`);

  // ── 2. Recompile bundles ─────────────────────────────────────────
  console.log("Bundles:");
  const localesToRebuild = NATIONAL_SEEDS.map((s) => ({ locale: s.localeCode, jurisdiction: s.jurisdiction }));
  for (const { locale, jurisdiction } of localesToRebuild) {
    try {
      const result = await recompileBundle(locale, jurisdiction);
      if (result.obligationCount === 0) {
        console.log(`  ↻ ${locale}@${NEW_VERSION} already exists (id=${result.bundleId}) — skipping`);
      } else {
        console.log(
          `  ✓ ${locale}@${NEW_VERSION} published (id=${result.bundleId}, obligations=${result.obligationCount}, rules=${result.ruleCount}${result.supersededId ? `, superseded=${result.supersededId}` : ""})`,
        );
      }
    } catch (err: any) {
      console.log(`  ✖ ${locale}@${NEW_VERSION} failed: ${err.message}`);
    }
  }

  console.log();
  console.log("Note: en-GB unchanged (FCA bundle is already authoritative for GB).");
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
