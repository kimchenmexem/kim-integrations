/**
 * FCA Adapter — ingests metadata for key FCA Handbook provisions
 * relevant to investment marketing (COBS 4, financial promotions).
 *
 * V1 scope: curated list of handbook provisions with canonical URLs.
 * Does NOT scrape the FCA website (brittle). Full text via manual upload.
 *
 * Non-crypto only.
 */

import type { SourceAdapter, AdapterResult, DiscoveredDocument, DiscoveredVersion } from "../types";

const FCA_PROVISIONS: Array<{
  ref: string;
  title: string;
  path: string;
  language: string;
}> = [
  {
    ref: "COBS 4.2",
    title: "Fair, clear and not misleading communications",
    path: "/handbook/COBS/4/2.html",
    language: "en",
  },
  {
    ref: "COBS 4.3",
    title: "Financial promotions to be identifiable as such",
    path: "/handbook/COBS/4/3.html",
    language: "en",
  },
  {
    ref: "COBS 4.5",
    title: "Communicating with retail clients",
    path: "/handbook/COBS/4/5.html",
    language: "en",
  },
  {
    ref: "COBS 4.5A",
    title: "Past performance — communications",
    path: "/handbook/COBS/4/5A.html",
    language: "en",
  },
  {
    ref: "COBS 4.6",
    title: "Past, simulated past and future performance",
    path: "/handbook/COBS/4/6.html",
    language: "en",
  },
  {
    ref: "COBS 4.10",
    title: "Approving and communicating financial promotions",
    path: "/handbook/COBS/4/10.html",
    language: "en",
  },
];

export class FcaAdapter implements SourceAdapter {
  readonly sourceCode = "FCA" as const;

  async sync(opts: { baseUrl?: string }): Promise<AdapterResult> {
    const baseUrl = opts.baseUrl ?? "https://www.handbook.fca.org.uk";
    const documents: DiscoveredDocument[] = [];
    const versions: DiscoveredVersion[] = [];

    for (const p of FCA_PROVISIONS) {
      const url = `${baseUrl}${p.path}`;

      documents.push({
        externalRef: p.ref,
        title: p.title,
        url,
        language: p.language,
      });

      const summary = [
        `Reference: ${p.ref}`,
        `Title: ${p.title}`,
        `Canonical URL: ${url}`,
        "",
        "Full handbook text not auto-ingested in V1. Upload manually via admin API.",
      ].join("\n");

      versions.push({
        externalRef: p.ref,
        versionLabel: `fca-v1-${today()}`,
        parsedText: summary,
        rawContent: summary,
        url,
      });
    }

    return {
      sourceCode: this.sourceCode,
      documents,
      versions,
      warnings: [
        "FCA V1: ingesting curated metadata for 6 COBS 4.x provisions. Full text via manual upload.",
      ],
    };
  }
}

function today(): string {
  return new Date().toISOString().slice(0, 10);
}
