/**
 * Runtime Bundle Loader.
 *
 * This is the ONLY file in the compliance module that the translation
 * pipeline should import. It reads published RuleBundles and caches them.
 *
 * If no published bundle exists for a locale, it returns null — callers
 * must fall back to legacy hardcoded rules.
 *
 * Design:
 *  - In-memory cache with 60s TTL (configurable via env).
 *  - Single published bundle per locale (latest publishedAt wins).
 *  - `invalidate(locale)` forces reload on next call.
 */

import { prisma } from "../../db";
import type { RuleBundleContent, SourceRef } from "@mexem/shared";

export interface LoadedBundle {
  id: number;
  localeCode: string;
  jurisdiction: string;
  version: string;
  content: RuleBundleContent;
  contentHash: string;
  sourceRefs: SourceRef[];
  publishedAt: string;
}

interface CacheEntry {
  bundle: LoadedBundle | null;
  loadedAt: number;
}

const TTL_MS = parseInt(process.env.BUNDLE_CACHE_TTL_MS ?? "60000", 10);
const cache = new Map<string, CacheEntry>();

/**
 * Kill switch. When COMPLIANCE_BUNDLES_ENABLED is explicitly set to "false",
 * loadBundle() returns null for every locale — full legacy fallback.
 * This is a hard bypass, not a cache trick.
 */
function bundlesEnabled(): boolean {
  return process.env.COMPLIANCE_BUNDLES_ENABLED !== "false";
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/**
 * Load the currently published bundle for a locale.
 * Returns null if no bundle is published → caller uses legacy rules.
 */
export async function loadBundle(localeCode: string): Promise<LoadedBundle | null> {
  if (!bundlesEnabled()) return null;

  const cached = cache.get(localeCode);
  if (cached && Date.now() - cached.loadedAt < TTL_MS) {
    return cached.bundle;
  }

  const row = await prisma.ruleBundle.findFirst({
    where: { localeCode, status: "published" },
    orderBy: { publishedAt: "desc" },
  });

  const bundle: LoadedBundle | null = row
    ? {
        id: row.id,
        localeCode: row.localeCode,
        jurisdiction: row.jurisdiction,
        version: row.version,
        content: safeParse<RuleBundleContent>(row.contentJson, {
          bannedPhrases: [],
          regexRules: [],
          requiredDisclaimers: [],
          promptContext: "",
          disclaimers: { riskWarning: "", pastPerformance: "" },
        }),
        contentHash: row.contentHash,
        sourceRefs: safeParse<SourceRef[]>(row.sourceRefsJson, []),
        publishedAt: (row.publishedAt ?? row.createdAt).toISOString(),
      }
    : null;

  cache.set(localeCode, { bundle, loadedAt: Date.now() });
  return bundle;
}

/** Force next loadBundle() to re-query for this locale. */
export function invalidateBundle(localeCode: string): void {
  cache.delete(localeCode);
}

/** Clear entire cache (useful in tests). */
export function clearBundleCache(): void {
  cache.clear();
}
