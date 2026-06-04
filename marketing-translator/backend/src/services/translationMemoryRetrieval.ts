import { prisma } from "../db";

interface MemoryExample {
  sourceText: string;
  targetText: string;
}

/**
 * Retrieves relevant past translations from translation memory.
 * Scoped by locale and textType, ranked by text similarity to the current source.
 *
 * Returns up to `limit` examples, preferring those with the highest
 * token overlap with the current source text.
 */
export async function retrieveTranslationMemory(
  sourceText: string,
  targetLocale: string,
  textType: string,
  limit: number = 3
): Promise<MemoryExample[]> {
  // Fetch recent candidates — broad pool, then rank locally
  const candidates = await prisma.translationMemoryEntry.findMany({
    where: { targetLocale, textType },
    orderBy: { createdAt: "desc" },
    take: 50,
  });

  if (candidates.length === 0) return [];

  // Rank by token overlap with current source text
  const sourceTokens = tokenize(sourceText);
  const scored = candidates.map(c => ({
    sourceText: c.sourceText,
    targetText: c.targetText,
    similarity: jaccardSimilarity(sourceTokens, tokenize(c.sourceText)),
  }));

  // Sort by similarity descending, deduplicate by target text
  scored.sort((a, b) => b.similarity - a.similarity);

  const seen = new Set<string>();
  const results: MemoryExample[] = [];
  for (const entry of scored) {
    if (results.length >= limit) break;
    // Skip exact self-match and duplicates
    const key = entry.targetText.toLowerCase().trim();
    if (seen.has(key)) continue;
    if (entry.sourceText.trim() === sourceText.trim()) continue;
    // Only include entries with meaningful similarity
    if (entry.similarity < 0.1) continue;
    seen.add(key);
    results.push({ sourceText: entry.sourceText, targetText: entry.targetText });
  }

  return results;
}

/**
 * Formats memory examples into a bounded prompt block.
 * Returns empty string if no examples.
 */
export function formatMemoryPrompt(examples: MemoryExample[]): string {
  if (examples.length === 0) return "";

  const lines = ["TRANSLATION MEMORY — prior translations for reference (use as style guidance, not verbatim):"];
  for (const ex of examples) {
    lines.push(`  Source: "${truncate(ex.sourceText, 150)}"`);
    lines.push(`  Translation: "${truncate(ex.targetText, 150)}"`);
    lines.push("");
  }
  return "\n" + lines.join("\n");
}

// ─── Helpers ───────────────────────────────────────────────────────

function tokenize(text: string): Set<string> {
  return new Set(
    text.toLowerCase()
      .replace(/[^\w\s]/g, " ")
      .split(/\s+/)
      .filter(t => t.length > 2)
  );
}

function jaccardSimilarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 && b.size === 0) return 0;
  let intersection = 0;
  for (const token of a) {
    if (b.has(token)) intersection++;
  }
  const union = a.size + b.size - intersection;
  return union > 0 ? intersection / union : 0;
}

function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "..." : text;
}
