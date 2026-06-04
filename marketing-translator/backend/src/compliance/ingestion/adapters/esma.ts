/**
 * ESMA Adapter — ingests metadata for key ESMA guidelines and Q&As
 * relevant to investment marketing communications under MiFID II.
 *
 * V1 scope: curated list with canonical URLs.
 * No live scraping of esma.europa.eu.
 *
 * Non-crypto only.
 */

import type { SourceAdapter, AdapterResult, DiscoveredDocument, DiscoveredVersion } from "../types";

const ESMA_DOCUMENTS: Array<{
  ref: string;
  title: string;
  url: string;
  language: string;
  publishedAt?: string;
}> = [
  {
    ref: "ESMA35-43-3448",
    title: "Guidelines on MiFID II product governance requirements",
    url: "https://www.esma.europa.eu/document/guidelines-mifid-ii-product-governance-requirements",
    language: "en",
    publishedAt: "2023-03-27",
  },
  {
    ref: "ESMA35-43-349",
    title: "Guidelines on certain aspects of the MiFID II suitability requirements",
    url: "https://www.esma.europa.eu/document/guidelines-certain-aspects-mifid-ii-suitability-requirements-0",
    language: "en",
    publishedAt: "2023-04-03",
  },
  {
    ref: "ESMA35-36-2060",
    title: "Q&As on MiFID II and MiFIR investor protection topics",
    url: "https://www.esma.europa.eu/document/qa-mifid-ii-and-mifir-investor-protection-topics",
    language: "en",
  },
  {
    ref: "ESMA-2022-marketing-comms",
    title: "Statement on marketing communications under MiFID II",
    url: "https://www.esma.europa.eu/press-news/esma-news",
    language: "en",
  },
];

export class EsmaAdapter implements SourceAdapter {
  readonly sourceCode = "ESMA" as const;

  async sync(opts: { baseUrl?: string }): Promise<AdapterResult> {
    const documents: DiscoveredDocument[] = [];
    const versions: DiscoveredVersion[] = [];

    for (const doc of ESMA_DOCUMENTS) {
      documents.push({
        externalRef: doc.ref,
        title: doc.title,
        url: doc.url,
        language: doc.language,
      });

      const summary = [
        `Reference: ${doc.ref}`,
        `Title: ${doc.title}`,
        `Published: ${doc.publishedAt ?? "unknown"}`,
        `URL: ${doc.url}`,
        "",
        "Full document text not auto-ingested in V1. Upload manually via admin API.",
      ].join("\n");

      versions.push({
        externalRef: doc.ref,
        versionLabel: `esma-v1-${today()}`,
        parsedText: summary,
        rawContent: summary,
        url: doc.url,
        publishedAt: doc.publishedAt ? new Date(doc.publishedAt) : undefined,
      });
    }

    return {
      sourceCode: this.sourceCode,
      documents,
      versions,
      warnings: [
        "ESMA V1: ingesting curated metadata for 4 key guidelines/Q&As. Full text via manual upload.",
      ],
    };
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
