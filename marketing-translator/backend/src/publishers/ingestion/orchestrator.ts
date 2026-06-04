/**
 * Publisher Sync Orchestrator.
 *
 * Runs an adapter, persists items (deduped by externalRef per source),
 * enforces topic/crypto exclusion filters, logs a PublisherSyncRun.
 *
 * Copyright-safe: stores metadata + short summary only.
 * Completely separate from compliance ingestion.
 */

import { prisma } from "../../db";
import { getPublisherAdapter } from "./adapters";
import type { TopicFilter, DiscoveredItem } from "./types";

export interface PublisherSyncSummary {
  runId: number;
  sourceCode: string;
  status: "success" | "failed" | "partial";
  itemsFetched: number;
  itemsCreated: number;
  itemsSkipped: number;
  itemsFiltered: number;
  warnings: string[];
  errors: string[];
  durationMs: number;
}

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

export async function runPublisherSync(
  sourceCode: string,
  triggeredBy: string = "manual:unknown"
): Promise<PublisherSyncSummary> {
  const t0 = Date.now();
  const errors: string[] = [];

  const source = await prisma.publisherSource.findUnique({ where: { code: sourceCode } });
  if (!source) throw new Error(`PublisherSource ${sourceCode} not found.`);
  if (!source.active) throw new Error(`PublisherSource ${sourceCode} is inactive.`);

  const syncRun = await prisma.publisherSyncRun.create({
    data: { sourceId: source.id, triggeredBy, status: "running" },
  });

  const filter: TopicFilter = {
    includeTags: safeParse<string[]>(source.includeTagsJson, []),
    includePaths: safeParse<string[]>(source.includePathsJson, []),
    excludeTags: safeParse<string[]>(source.excludeTagsJson, []),
    excludePaths: safeParse<string[]>(source.excludePathsJson, []),
  };

  let adapterResult;
  try {
    const adapter = getPublisherAdapter(source.code, source.ingestionMode);
    adapterResult = await adapter.sync({ canonicalUrl: source.canonicalUrl, filter });
  } catch (err: any) {
    errors.push(`Adapter error: ${err?.message ?? String(err)}`);
    await finalize(syncRun.id, "failed", 0, 0, 0, errors);
    return { runId: syncRun.id, sourceCode, status: "failed", itemsFetched: 0, itemsCreated: 0, itemsSkipped: 0, itemsFiltered: 0, warnings: [], errors, durationMs: Date.now() - t0 };
  }

  let itemsCreated = 0;
  let itemsSkipped = 0;
  let itemsFiltered = 0;

  for (const item of adapterResult.items) {
    // Apply exclusion filters (adapters should pre-filter, but we double-check)
    if (shouldExclude(item, filter)) { itemsFiltered++; continue; }

    try {
      const existing = await prisma.publisherDocument.findFirst({
        where: { sourceId: source.id, externalRef: item.externalRef },
      });

      if (existing) {
        // Update metadata if title/summary changed
        await prisma.publisherDocument.update({
          where: { id: existing.id },
          data: {
            title: item.title,
            url: item.url ?? existing.url,
            summary: item.summary ? truncate(item.summary, 300) : existing.summary,
            section: item.section ?? existing.section,
            tagsJson: item.tags ? JSON.stringify(item.tags) : existing.tagsJson,
          },
        });
        itemsSkipped++;
      } else {
        await prisma.publisherDocument.create({
          data: {
            sourceId: source.id,
            externalRef: item.externalRef,
            title: item.title,
            url: item.url ?? null,
            publishedAt: item.publishedAt ?? null,
            language: item.language ?? source.language,
            section: item.section ?? null,
            tagsJson: item.tags ? JSON.stringify(item.tags) : null,
            summary: item.summary ? truncate(item.summary, 300) : null,
          },
        });
        itemsCreated++;
      }
    } catch (err: any) {
      errors.push(`Item "${item.externalRef}": ${err?.message ?? String(err)}`);
    }
  }

  const status = errors.length > 0 ? (itemsCreated > 0 ? "partial" : "failed") : "success";
  await finalize(syncRun.id, status, adapterResult.items.length, itemsCreated, itemsFiltered, errors);

  return {
    runId: syncRun.id,
    sourceCode,
    status,
    itemsFetched: adapterResult.items.length,
    itemsCreated,
    itemsSkipped,
    itemsFiltered,
    warnings: adapterResult.warnings,
    errors,
    durationMs: Date.now() - t0,
  };
}

function shouldExclude(item: DiscoveredItem, filter: TopicFilter): boolean {
  const lowerTags = (item.tags ?? []).map(t => t.toLowerCase());
  const lowerTitle = item.title.toLowerCase();
  const lowerSection = (item.section ?? "").toLowerCase();
  const url = item.url ?? "";

  for (const ex of filter.excludeTags) {
    const lex = ex.toLowerCase();
    if (lowerTags.includes(lex) || lowerSection.includes(lex) || lowerTitle.includes(lex)) return true;
  }
  for (const ep of filter.excludePaths) {
    if (url.includes(ep)) return true;
  }
  return false;
}

function truncate(s: string, max: number): string {
  return s.length <= max ? s : s.substring(0, max - 1) + "…";
}

async function finalize(id: number, status: string, fetched: number, created: number, filtered: number, errors: string[]) {
  await prisma.publisherSyncRun.update({
    where: { id },
    data: {
      status,
      finishedAt: new Date(),
      itemsFetched: fetched,
      itemsCreated: created,
      itemsFiltered: filtered,
      errorMessage: errors.length > 0 ? errors.join("\n") : null,
    },
  });
}
