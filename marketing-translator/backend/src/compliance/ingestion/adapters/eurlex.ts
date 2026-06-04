/**
 * EUR-Lex Adapter — ingests metadata for key MiFID II / investment marketing
 * regulations from EUR-Lex using their public REST search endpoint.
 *
 * V1 scope: fetches a curated list of CELEX numbers relevant to MEXEM's
 * regulated-investment marketing compliance. Does NOT scrape full text;
 * captures metadata (title, published date, canonical URL) and a short
 * summary as parsedText. Full text is handled via manual upload.
 *
 * Non-crypto only.
 */

import type { SourceAdapter, AdapterResult, DiscoveredDocument, DiscoveredVersion } from "../types";

/**
 * Curated set of CELEX document IDs relevant to investment marketing compliance.
 * These are the canonical source references for MEXEM's locale-wide rules.
 */
const CELEX_DOCUMENTS: Array<{
  celex: string;
  title: string;
  externalRef: string;
  language: string;
  effectiveFrom?: string;
}> = [
  {
    celex: "32014L0065",
    title: "MiFID II — Markets in Financial Instruments Directive",
    externalRef: "MiFID II (Directive 2014/65/EU)",
    language: "en",
    effectiveFrom: "2018-01-03",
  },
  {
    celex: "32014R0600",
    title: "MiFIR — Markets in Financial Instruments Regulation",
    externalRef: "MiFIR (Regulation 600/2014)",
    language: "en",
    effectiveFrom: "2018-01-03",
  },
  {
    celex: "32017R0565",
    title: "Commission Delegated Regulation (EU) 2017/565 — MiFID II organisational requirements, marketing standards",
    externalRef: "MiFID II Delegated Reg. 2017/565",
    language: "en",
    effectiveFrom: "2018-01-03",
  },
  {
    celex: "32014R1286",
    title: "PRIIPs Regulation — Key Information Documents",
    externalRef: "PRIIPs (Regulation 1286/2014)",
    language: "en",
    effectiveFrom: "2018-01-01",
  },
];

export class EurLexAdapter implements SourceAdapter {
  readonly sourceCode = "EUR_LEX" as const;

  async sync(opts: { baseUrl?: string; maxItems?: number }): Promise<AdapterResult> {
    const baseUrl = opts.baseUrl ?? "https://eur-lex.europa.eu";
    const documents: DiscoveredDocument[] = [];
    const versions: DiscoveredVersion[] = [];
    const warnings: string[] = [];

    for (const entry of CELEX_DOCUMENTS) {
      const canonicalUrl = `${baseUrl}/legal-content/EN/TXT/?uri=CELEX:${entry.celex}`;

      documents.push({
        externalRef: entry.externalRef,
        title: entry.title,
        url: canonicalUrl,
        language: entry.language,
      });

      // V1: version content = metadata summary (not full scrape).
      // Full-text ingestion comes via manual upload or future Stage 3b parser.
      const summary = [
        `CELEX: ${entry.celex}`,
        `Title: ${entry.title}`,
        `Canonical URL: ${canonicalUrl}`,
        `Effective from: ${entry.effectiveFrom ?? "unknown"}`,
        "",
        "Full text not auto-ingested in V1. Upload manually via admin API.",
      ].join("\n");

      versions.push({
        externalRef: entry.externalRef,
        versionLabel: `celex-v1-${today()}`,
        parsedText: summary,
        rawContent: summary,
        url: canonicalUrl,
        effectiveFrom: entry.effectiveFrom ? new Date(entry.effectiveFrom) : undefined,
      });
    }

    warnings.push(
      "EUR_LEX V1: ingesting curated metadata only (4 key MiFID II / PRIIPs documents). Full text via manual upload."
    );

    return { sourceCode: this.sourceCode, documents, versions, warnings };
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
