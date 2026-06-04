/**
 * Seed initial compliance-document content for the 5 EU regulator sources.
 *
 * Why this exists:
 *   The 5 RegulatorySource rows (BE_FSMA, CY_CYSEC, ES_CNMV, FR_REGAFI,
 *   IT_CONSOB) are seeded by seed-compliance-sources.ts but they ship with
 *   ZERO documents — meaning the compliance pipeline falls back to the
 *   hardcoded fallback rules in services/localeRules.ts. To exercise the
 *   real bundle-driven path you need at least one document version per
 *   source.
 *
 * IMPORTANT:
 *   The text in this seed is a generic PLACEHOLDER summarising EU
 *   financial-marketing principles (fair/clear/not-misleading, risk
 *   warnings, no guarantees). It is NOT taken from any specific regulator
 *   handbook and MUST NOT be treated as an authoritative source. Every
 *   document is marked "(placeholder)" in its title and notes for
 *   visibility. Replace with the actual regulator text before relying on
 *   compliance decisions in production.
 *
 * Idempotent: re-running this script does not duplicate documents
 * (handled by the @@unique(sourceId, externalRef) constraint) or
 * versions (handled by contentHash dedup in createDocumentVersion).
 *
 * Run with:
 *   npm --workspace backend run seed:compliance-content
 */

import "dotenv/config";
import { prisma } from "../db";
import {
  createDocument,
  createDocumentVersion,
  findSourceByCodeOrId,
} from "../compliance/sources/service";

interface SeedEntry {
  sourceCode: string;
  externalRef: string;
  title: string;
  language: string;
  versionLabel: string;
  url: string | null;
  /** Placeholder regulatory-principles text. Replace with the real text per regulator. */
  parsedText: string;
}

// Generic EU MiFID II marketing-principles digest, locale-tinted. Same
// substantive rules across regulators; the text body is short on purpose
// so it's obvious this is a placeholder.
function principlesText(regulatorName: string, jurisdiction: string): string {
  return `${regulatorName} — Marketing communications: applicable principles (placeholder digest)

This document is a PLACEHOLDER summarising the EU MiFID II / national
financial-marketing principles that apply to marketing communications
addressed to retail and professional clients in ${jurisdiction}. It is
NOT an extract from any specific ${regulatorName} guidance. Replace the
content of this version with the actual regulator text before relying on
compliance decisions in production.

1. Fair, clear and not misleading
   All marketing material must present information in a way that is fair,
   clear, and not misleading. Statements of fact must be accurate and
   verifiable. Marketing must clearly identify itself as such.

2. No guarantees of return or capital safety
   No marketing communication may state, imply, or suggest that a financial
   product offers a guaranteed return, capital protection, or freedom from
   risk unless those features are contractually guaranteed by an independent
   third party and disclosed with all material conditions and limitations.

3. Risk warnings — prominence and balance
   Where benefits, returns, or performance are highlighted, an equally
   prominent statement of the corresponding risks must accompany them.
   Risk warnings must not be relegated to small print or links.

4. Past performance
   Past performance is not a reliable indicator of future results. Where
   past performance figures are quoted, the period covered and the source
   must be disclosed. Simulated or hypothetical performance must be
   labelled as such.

5. Target audience and suitability
   Marketing must not suggest a product is suitable for all investors.
   Where a product is targeted at a specific audience (e.g. professional
   clients), the audience must be clearly identified.

6. Authority and superiority claims
   Claims of market leadership, regulator endorsement, or competitive
   superiority must be substantiated. The marketing must not imply
   ${regulatorName} endorsement of any specific product or firm.

7. Urgency and pressure
   Marketing must not create artificial urgency, scarcity, or pressure
   that could influence a client to make a decision without adequate
   consideration. Time-limited offers must clearly disclose the deadline
   and the terms.

8. Complaints and contact information
   Every marketing communication must include or link to the firm's
   regulatory status, applicable complaints procedure, and contact details
   for the relevant regulator.

This placeholder is intentionally short. Real ${regulatorName} guidance
on these topics is significantly more detailed; consult the regulator's
official publications and replace this document before treating compliance
decisions as authoritative.
`;
}

const SEED: SeedEntry[] = [
  {
    sourceCode: "BE_FSMA",
    externalRef: "FSMA-MKT-PRINCIPLES-PLACEHOLDER",
    title: "FSMA marketing principles (placeholder)",
    language: "fr",
    versionLabel: "placeholder-v1",
    url: null,
    parsedText: principlesText("FSMA (Belgium)", "Belgium"),
  },
  {
    sourceCode: "CY_CYSEC",
    externalRef: "CYSEC-MKT-PRINCIPLES-PLACEHOLDER",
    title: "CySEC marketing principles (placeholder)",
    language: "en",
    versionLabel: "placeholder-v1",
    url: null,
    parsedText: principlesText("CySEC (Cyprus)", "Cyprus"),
  },
  {
    sourceCode: "ES_CNMV",
    externalRef: "CNMV-MKT-PRINCIPLES-PLACEHOLDER",
    title: "CNMV marketing principles (placeholder)",
    language: "es",
    versionLabel: "placeholder-v1",
    url: null,
    parsedText: principlesText("CNMV (Spain)", "Spain"),
  },
  {
    sourceCode: "FR_REGAFI",
    externalRef: "REGAFI-MKT-PRINCIPLES-PLACEHOLDER",
    title: "French regulator marketing principles (placeholder)",
    language: "fr",
    versionLabel: "placeholder-v1",
    url: null,
    parsedText: principlesText("AMF / ACPR (France)", "France"),
  },
  {
    sourceCode: "IT_CONSOB",
    externalRef: "CONSOB-MKT-PRINCIPLES-PLACEHOLDER",
    title: "CONSOB marketing principles (placeholder)",
    language: "it",
    versionLabel: "placeholder-v1",
    url: null,
    parsedText: principlesText("CONSOB (Italy)", "Italy"),
  },
];

async function main() {
  console.log(`Seeding ${SEED.length} placeholder document(s)…\n`);

  let docCreated = 0;
  let docSkipped = 0;
  let verCreated = 0;
  let verDedup = 0;

  for (const entry of SEED) {
    const source = await findSourceByCodeOrId(entry.sourceCode);
    if (!source) {
      console.error(`  ✗ source not found: ${entry.sourceCode} — skipping (run seed-compliance-sources first?)`);
      continue;
    }

    // Document: upsert by (sourceId, externalRef)
    let document = await prisma.sourceDocument.findUnique({
      where: { sourceId_externalRef: { sourceId: source.id, externalRef: entry.externalRef } },
    });
    if (!document) {
      document = await createDocument({
        sourceId: source.id,
        externalRef: entry.externalRef,
        title: entry.title,
        url: entry.url,
        language: entry.language,
        active: true,
        notes: "PLACEHOLDER — replace with real regulator text before using compliance decisions in production.",
      });
      docCreated++;
      console.log(`  + doc ${entry.sourceCode}/${entry.externalRef}  (id=${document.id})`);
    } else {
      docSkipped++;
      console.log(`  · doc ${entry.sourceCode}/${entry.externalRef}  (id=${document.id}) — exists`);
    }

    // Version: idempotent via contentHash dedup
    const { version, dedup } = await createDocumentVersion({
      documentId: document.id,
      versionLabel: entry.versionLabel,
      parsedText: entry.parsedText,
      fetchedBy: "seed:compliance-content",
    });
    if (!version) continue;
    if (dedup) {
      verDedup++;
      console.log(`    · version ${entry.versionLabel}  — dedup (hash matches existing v#${version.id})`);
    } else {
      verCreated++;
      console.log(`    + version ${entry.versionLabel}  (id=${version.id}, ${entry.parsedText.length} chars)`);
    }
  }

  console.log(`\nDone. documents: ${docCreated} created, ${docSkipped} already existed.`);
  console.log(`      versions:  ${verCreated} created, ${verDedup} dedup.`);
  console.log(`\nNext steps:`);
  console.log(`  1. Open Compliance Admin → Sources → click a source to inspect.`);
  console.log(`  2. Go to Obligations → create obligations referencing these source documents.`);
  console.log(`  3. Add Rules under each obligation, transition to "approved".`);
  console.log(`  4. Bundles → Compile a draft for each locale → Publish.`);
  console.log(`  5. Re-run Compliance Check — it will now use the published bundle instead of the legacy fallback.`);
}

main()
  .catch((err) => {
    console.error("seed:compliance-content failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
