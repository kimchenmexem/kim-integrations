/**
 * CuratedAdapter — returns a static set of curated reference items
 * for a publisher source. Useful for exchanges and official market pages
 * where the content is a stable set of known pages, not a feed.
 *
 * V1: returns curated metadata items from an in-code list.
 * Copyright-safe: only titles, URLs, and short descriptions.
 */

import type { PublisherAdapter, PublisherAdapterResult, DiscoveredItem, TopicFilter } from "../types";

/** Registry of curated items per source code. */
const CURATED_ITEMS: Record<string, DiscoveredItem[]> = {
  BORSA_ITALIANA: [
    { externalRef: "bi-azioni-principali", title: "Borsa Italiana — Azioni principali", url: "https://www.borsaitaliana.it/borsa/azioni/listino-a-z.html", section: "equities", summary: "Main Italian stock listings on Borsa Italiana (Euronext Milan)." },
    { externalRef: "bi-etf", title: "Borsa Italiana — ETF", url: "https://www.borsaitaliana.it/borsa/etf/elenco.html", section: "ETFs", summary: "ETF listings on Borsa Italiana." },
  ],
  EURONEXT_AMS: [
    { externalRef: "enx-ams-equities", title: "Euronext Amsterdam — Equities", url: "https://www.euronext.com/en/markets/amsterdam/equities", section: "equities", summary: "Amsterdam-listed equities on Euronext." },
    { externalRef: "enx-ams-etfs", title: "Euronext Amsterdam — ETFs", url: "https://www.euronext.com/en/markets/amsterdam/etfs", section: "ETFs", summary: "Amsterdam-listed ETFs on Euronext." },
  ],
  EURONEXT_PARIS: [
    { externalRef: "enx-par-equities", title: "Euronext Paris — Equities", url: "https://live.euronext.com/en/markets/paris/equities", section: "equities", summary: "Paris-listed equities on Euronext." },
    { externalRef: "enx-par-etfs", title: "Euronext Paris — ETFs", url: "https://live.euronext.com/en/markets/paris/etfs", section: "ETFs", summary: "Paris-listed ETFs on Euronext." },
  ],
};

export class CuratedPublisherAdapter implements PublisherAdapter {
  readonly sourceCode: string;
  constructor(sourceCode: string) { this.sourceCode = sourceCode; }

  async sync(opts: { filter: TopicFilter }): Promise<PublisherAdapterResult> {
    const raw = CURATED_ITEMS[this.sourceCode] ?? [];
    const items = raw.filter(item => !isExcluded(item, opts.filter));
    const filtered = raw.length - items.length;

    return {
      sourceCode: this.sourceCode,
      items,
      warnings: filtered > 0
        ? [`${this.sourceCode}: ${filtered} curated items excluded by topic filter.`]
        : [],
    };
  }
}

function isExcluded(item: DiscoveredItem, filter: TopicFilter): boolean {
  const lowerTags = (item.tags ?? []).map(t => t.toLowerCase());
  const lowerSection = (item.section ?? "").toLowerCase();
  const lowerTitle = item.title.toLowerCase();
  const url = item.url ?? "";

  // Exclude by tags
  for (const ex of filter.excludeTags) {
    const lex = ex.toLowerCase();
    if (lowerTags.includes(lex) || lowerSection.includes(lex) || lowerTitle.includes(lex)) return true;
  }
  // Exclude by paths
  for (const ep of filter.excludePaths) {
    if (url.includes(ep)) return true;
  }
  return false;
}
