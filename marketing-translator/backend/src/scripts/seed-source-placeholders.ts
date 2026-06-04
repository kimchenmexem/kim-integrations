/**
 * Seed source-document placeholders for the 9 RegulatorySource rows that
 * have no SourceDocument attached.
 *
 * Without at least one document row, the Sources tab in PublisherAdmin shows
 * "no documents" for these regulators, and the compliance check response
 * surfaces sourceRefs that don't link to anything reviewable in the UI.
 *
 * What this seed does NOT do: it does not fetch live document text. The
 * SourceDocumentVersion content is a single-line "placeholder pending
 * ingestion" note so the UI stops claiming we have zero documentation when
 * we have meaningful obligations citing this source.
 *
 * Idempotent: skips sources that already have at least one document.
 *
 * Run: npm --workspace backend run seed:source-placeholders
 */

import crypto from "crypto";
import { prisma } from "../db";

interface Placeholder {
  sourceCode: string;
  externalRef: string;
  title: string;
  url?: string;
  language?: string;
  versionLabel: string;
  parsedText: string;
}

const PLACEHOLDERS: Placeholder[] = [
  // ── EU ─────────────────────────────────────────────────────────────
  {
    sourceCode: "EUR_LEX",
    externalRef: "MiFID II (Directive 2014/65/EU)",
    title: "MiFID II — Directive 2014/65/EU on markets in financial instruments",
    url: "https://eur-lex.europa.eu/legal-content/EN/TXT/?uri=CELEX:32014L0065",
    language: "EN",
    versionLabel: "2014-05-15",
    parsedText:
      "Placeholder for ingestion. Article 24(3): all information addressed by an investment firm to clients or potential clients, including marketing communications, shall be fair, clear and not misleading. Marketing communications shall be clearly identifiable as such.",
  },
  {
    sourceCode: "ESMA",
    externalRef: "ESMA35-43-349",
    title: "ESMA Guidelines on marketing communications under MiFID II",
    url: "https://www.esma.europa.eu/document/guidelines-marketing-communications-under-regulation-cross-border-distribution-funds",
    language: "EN",
    versionLabel: "2022-08-02",
    parsedText:
      "Placeholder for ingestion. ESMA guidelines on marketing communications: information must be presented in a balanced manner, with risks given equivalent prominence to benefits. Past-performance presentations must follow the specified format and include the standard disclaimer.",
  },
  // ── IT ─────────────────────────────────────────────────────────────
  {
    sourceCode: "CONSOB",
    externalRef: "Regolamento Intermediari",
    title: "CONSOB Regolamento Intermediari — Norme di comportamento per le comunicazioni di marketing",
    url: "https://www.consob.it/web/area-pubblica/regolamenti",
    language: "IT",
    versionLabel: "2018-02-15",
    parsedText:
      "Placeholder per l'ingestion. Articolo 36 del Regolamento Intermediari CONSOB: l'informazione deve essere corretta, chiara e non fuorviante. Le comunicazioni di marketing devono essere chiaramente identificabili come tali. I rischi devono essere presentati con la stessa prominenza dei benefici.",
  },
  // ── FR ─────────────────────────────────────────────────────────────
  {
    sourceCode: "AMF",
    externalRef: "AMF Position DOC-2013-12",
    title: "AMF Position DOC-2013-12 — Communications publicitaires sur les instruments financiers",
    url: "https://www.amf-france.org/fr/reglementation/doctrine/doc-2013-12",
    language: "FR",
    versionLabel: "2013-09-30",
    parsedText:
      "Espace réservé pour l'ingestion. Position AMF DOC-2013-12 sur les communications publicitaires relatives aux instruments financiers: toute communication publicitaire doit être équilibrée, présenter les risques avec la même prominence que les avantages, et inclure les mentions obligatoires de l'AMF.",
  },
  // ── NL ─────────────────────────────────────────────────────────────
  {
    sourceCode: "AFM",
    externalRef: "Beleidsregel Informatieverstrekking 2018",
    title: "AFM Beleidsregel Informatieverstrekking — Informatie moet correct, duidelijk en niet misleidend zijn",
    url: "https://www.afm.nl/nl-nl/sector/themas/beleggen/informatieverstrekking",
    language: "NL",
    versionLabel: "2018-01-01",
    parsedText:
      "Plaatshouder voor ingestion. AFM Beleidsregel Informatieverstrekking: alle informatie aan retailbeleggers moet correct, duidelijk en niet misleidend zijn. Risico's moeten met dezelfde prominentie worden gepresenteerd als voordelen. In het verleden behaalde resultaten bieden geen garantie voor de toekomst.",
  },
  // ── BE ─────────────────────────────────────────────────────────────
  {
    sourceCode: "FSMA",
    externalRef: "FSMA Mededeling — Reclame financiële producten",
    title: "FSMA — Mededeling over reclame voor financiële producten / Communication sur la publicité pour produits financiers",
    url: "https://www.fsma.be/en/marketing-financial-products",
    language: "NL",
    versionLabel: "2015-01-01",
    parsedText:
      "Placeholder voor ingestion. FSMA-mededeling over reclame: alle reclameboodschappen voor financiële producten moeten correct, duidelijk en niet misleidend zijn. Risico's en kosten moeten evenwaardig aan voordelen worden gepresenteerd.",
  },
  // ── ES ─────────────────────────────────────────────────────────────
  {
    sourceCode: "CNMV",
    externalRef: "Circular 1/2018, Norma 9",
    title: "CNMV Circular 1/2018 — Publicidad de productos y servicios de inversión",
    url: "https://www.cnmv.es/portal/Legislacion/Circulares/Circular_1_2018.aspx",
    language: "ES",
    versionLabel: "2018-12-12",
    parsedText:
      "Marcador de posición para ingestión. CNMV Circular 1/2018 Norma 9 sobre publicidad de productos y servicios de inversión: la información publicitaria debe ser clara, equilibrada y no debe crear expectativas no realistas. Las advertencias de riesgo deben tener una prominencia equivalente a los beneficios anunciados.",
  },
  // ── CY ─────────────────────────────────────────────────────────────
  {
    sourceCode: "CYSEC",
    externalRef: "CySEC Circular C108",
    title: "CySEC Circular C108 — Digital marketing standards for Cyprus Investment Firms",
    url: "https://www.cysec.gov.cy/en-GB/legislation/circulars/",
    language: "EN",
    versionLabel: "2017-03-01",
    parsedText:
      "Placeholder for ingestion. CySEC Circular C108 establishes digital marketing standards for Cyprus Investment Firms (CIFs): marketing communications must comply with MiFID II Article 24(3), digital ads must include the FX/CFD risk warnings where applicable, and benefit claims must be balanced with explicit capital-loss warnings.",
  },
  // ── GB ─────────────────────────────────────────────────────────────
  {
    sourceCode: "FCA",
    externalRef: "COBS 4 — Communications with clients",
    title: "FCA Handbook COBS 4 — Communications with clients, including financial promotions",
    url: "https://www.handbook.fca.org.uk/handbook/COBS/4/",
    language: "EN",
    versionLabel: "2024-01-01",
    parsedText:
      "Placeholder for ingestion. FCA Handbook COBS 4.2.1R: a firm must ensure that a communication or a financial promotion is fair, clear and not misleading. COBS 4.5: information about benefits must not disguise, diminish or obscure important warnings. COBS 4.6.2R: past performance must not be the most prominent feature of the promotion.",
  },
];

async function main() {
  console.log("Seeding placeholder source-documents for empty regulatory sources...\n");

  let createdDocs = 0;
  let createdVersions = 0;
  let skipped = 0;

  for (const ph of PLACEHOLDERS) {
    const source = await prisma.regulatorySource.findUnique({ where: { code: ph.sourceCode } });
    if (!source) {
      console.log(`  ✖ source ${ph.sourceCode} not found — skipping`);
      continue;
    }

    const existingDocCount = await prisma.sourceDocument.count({ where: { sourceId: source.id } });
    if (existingDocCount > 0) {
      skipped++;
      console.log(`  ↻ ${ph.sourceCode}: already has ${existingDocCount} document(s) — skipping`);
      continue;
    }

    const doc = await prisma.sourceDocument.create({
      data: {
        sourceId: source.id,
        externalRef: ph.externalRef,
        title: ph.title,
        url: ph.url,
        language: ph.language,
        notes: "Placeholder document. Real content will be populated by future ingestion runs.",
      },
    });
    createdDocs++;

    const contentHash = crypto
      .createHash("sha256")
      .update(ph.parsedText, "utf8")
      .digest("hex");

    await prisma.sourceDocumentVersion.create({
      data: {
        documentId: doc.id,
        versionLabel: ph.versionLabel,
        contentHash,
        rawContent: ph.parsedText, // placeholder = same as parsed
        parsedText: ph.parsedText,
        fetchedBy: "manual:source-placeholders-seed",
      },
    });
    createdVersions++;
    console.log(`  ✓ ${ph.sourceCode} — "${ph.externalRef}" + v${ph.versionLabel}`);
  }

  console.log();
  console.log(`Created: ${createdDocs} documents, ${createdVersions} versions. Skipped: ${skipped}.`);
}

main()
  .catch((err) => { console.error("Seed failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
