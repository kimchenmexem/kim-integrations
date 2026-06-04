/**
 * Types for the compliance source ingestion layer.
 *
 * These types never appear in the runtime translation path.
 * They are used exclusively by adapters, the sync orchestrator, and the diff service.
 */

import type { SourceFamilyCode } from "@mexem/shared";

/** A document discovered by an adapter (may or may not already exist in DB). */
export interface DiscoveredDocument {
  /** Stable external reference e.g. "COBS 4.2", "MiFID II Art. 24", "Circular 1/2019" */
  externalRef: string;
  title: string;
  url?: string;
  language?: string;
}

/** A version/snapshot of a document produced by an adapter. */
export interface DiscoveredVersion {
  /** Must correspond to a DiscoveredDocument.externalRef from the same run */
  externalRef: string;
  /** Human label: "2024-03-01", "v1.2", ISO date, etc. */
  versionLabel: string;
  /**
   * Normalised text content of this version.
   * For feed-based adapters this may be a brief abstract + link.
   * For manual adapters this is the user-provided text.
   */
  parsedText: string;
  /** Raw/original content before normalisation. If same as parsedText, pass identical string. */
  rawContent: string;
  /** Canonical URL for this specific version (if different from document URL). */
  url?: string;
  /** When the source was published (from source metadata). */
  publishedAt?: Date;
  /** When the regulation/guidance takes effect. */
  effectiveFrom?: Date;
  /** When the regulation/guidance ceases to apply (optional). */
  effectiveUntil?: Date;
}

/** What an adapter returns after one run. */
export interface AdapterResult {
  /** Source code this adapter belongs to. */
  sourceCode: SourceFamilyCode;
  /** Documents discovered in this run. */
  documents: DiscoveredDocument[];
  /** Versions/snapshots discovered in this run. */
  versions: DiscoveredVersion[];
  /** Warnings / non-fatal issues encountered during the run. */
  warnings: string[];
}

/** The interface every source adapter must implement. */
export interface SourceAdapter {
  /** Which source code this adapter handles. */
  readonly sourceCode: SourceFamilyCode;

  /**
   * Perform a sync: discover documents and their latest versions.
   *
   * Adapters MUST NOT mutate the database. They return DiscoveredDocuments
   * and DiscoveredVersions; the orchestrator handles persistence.
   *
   * @param opts.baseUrl — the source's baseUrl from the registry (may be undefined).
   * @param opts.maxItems — advisory cap on how many documents to return.
   */
  sync(opts: { baseUrl?: string; maxItems?: number }): Promise<AdapterResult>;
}
