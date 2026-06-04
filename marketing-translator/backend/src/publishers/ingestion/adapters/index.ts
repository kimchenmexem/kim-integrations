/**
 * Publisher adapter registry.
 * Maps ingestionMode + sourceCode to the right adapter.
 */

import type { PublisherAdapter } from "../types";
import { ManualPublisherAdapter } from "./manual";
import { CuratedPublisherAdapter } from "./curated";

/** Sources that use the curated adapter (exchanges with stable page sets). */
const CURATED_SOURCES = new Set(["BORSA_ITALIANA", "EURONEXT_AMS", "EURONEXT_PARIS"]);

export function getPublisherAdapter(sourceCode: string, ingestionMode: string): PublisherAdapter {
  if (CURATED_SOURCES.has(sourceCode)) return new CuratedPublisherAdapter(sourceCode);
  if (ingestionMode === "manual") return new ManualPublisherAdapter(sourceCode);
  // rss and html_list sources use ManualAdapter in V1 — no live fetching yet.
  return new ManualPublisherAdapter(sourceCode);
}
