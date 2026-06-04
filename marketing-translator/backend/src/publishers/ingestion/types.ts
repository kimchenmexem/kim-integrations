/**
 * Publisher ingestion types.
 *
 * Completely separate from compliance ingestion.
 * NON-CRYPTO. Adapters must respect exclude filters.
 * Copyright-safe: store metadata + short summary only, never full article text.
 */

/** An item discovered by a publisher adapter. */
export interface DiscoveredItem {
  externalRef: string;
  title: string;
  url?: string;
  publishedAt?: Date;
  language?: string;
  section?: string;
  tags?: string[];
  /** Short summary from RSS <description> or lede. Max ~300 chars. Never full article. */
  summary?: string;
}

/** What an adapter returns after one run. */
export interface PublisherAdapterResult {
  sourceCode: string;
  items: DiscoveredItem[];
  warnings: string[];
}

/** Filter config read from the PublisherSource row. */
export interface TopicFilter {
  includeTags: string[];
  includePaths: string[];
  excludeTags: string[];
  excludePaths: string[];
}

/** The interface every publisher adapter must implement. */
export interface PublisherAdapter {
  readonly sourceCode: string;
  sync(opts: { canonicalUrl: string; filter: TopicFilter }): Promise<PublisherAdapterResult>;
}
