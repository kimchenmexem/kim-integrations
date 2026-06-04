/**
 * Diff Detection Service
 *
 * Compares two SourceDocumentVersions for the same document and
 * produces a structured summary of changes.
 *
 * V1: line-level diff. No semantic analysis.
 */

import { prisma } from "../../db";

export interface DiffHunk {
  type: "added" | "removed" | "unchanged";
  lines: string[];
}

export interface DiffResult {
  documentId: number;
  fromVersionId: number | null;
  toVersionId: number;
  isNew: boolean;
  hasChanges: boolean;
  hunks: DiffHunk[];
  stats: { added: number; removed: number; unchanged: number };
}

/**
 * Compute the diff between the latest two versions of a document.
 *
 * If only one version exists → marks the whole content as "added" (new document).
 * If contentHash matches → returns hasChanges=false immediately.
 */
export async function diffLatestVersions(documentId: number): Promise<DiffResult | null> {
  const versions = await prisma.sourceDocumentVersion.findMany({
    where: { documentId },
    orderBy: { fetchedAt: "desc" },
    take: 2,
    select: { id: true, parsedText: true, contentHash: true },
  });

  if (versions.length === 0) return null;

  const latest = versions[0];

  // Only one version → brand-new content
  if (versions.length === 1) {
    const lines = latest.parsedText.split("\n");
    return {
      documentId,
      fromVersionId: null,
      toVersionId: latest.id,
      isNew: true,
      hasChanges: true,
      hunks: [{ type: "added", lines }],
      stats: { added: lines.length, removed: 0, unchanged: 0 },
    };
  }

  const previous = versions[1];

  // Same hash → no change
  if (latest.contentHash === previous.contentHash) {
    return {
      documentId,
      fromVersionId: previous.id,
      toVersionId: latest.id,
      isNew: false,
      hasChanges: false,
      hunks: [],
      stats: { added: 0, removed: 0, unchanged: latest.parsedText.split("\n").length },
    };
  }

  // Compute line-level diff
  const oldLines = previous.parsedText.split("\n");
  const newLines = latest.parsedText.split("\n");
  const hunks = computeLineDiff(oldLines, newLines);
  const stats = { added: 0, removed: 0, unchanged: 0 };
  for (const h of hunks) {
    stats[h.type] += h.lines.length;
  }

  return {
    documentId,
    fromVersionId: previous.id,
    toVersionId: latest.id,
    isNew: false,
    hasChanges: true,
    hunks,
    stats,
  };
}

/**
 * Diff between two specific version IDs.
 */
export async function diffVersions(fromId: number, toId: number): Promise<DiffResult | null> {
  const [fromVer, toVer] = await Promise.all([
    prisma.sourceDocumentVersion.findUnique({ where: { id: fromId } }),
    prisma.sourceDocumentVersion.findUnique({ where: { id: toId } }),
  ]);

  if (!toVer) return null;
  if (!fromVer) {
    const lines = toVer.parsedText.split("\n");
    return {
      documentId: toVer.documentId,
      fromVersionId: null,
      toVersionId: toVer.id,
      isNew: true,
      hasChanges: true,
      hunks: [{ type: "added", lines }],
      stats: { added: lines.length, removed: 0, unchanged: 0 },
    };
  }

  if (fromVer.contentHash === toVer.contentHash) {
    return {
      documentId: toVer.documentId,
      fromVersionId: fromVer.id,
      toVersionId: toVer.id,
      isNew: false,
      hasChanges: false,
      hunks: [],
      stats: { added: 0, removed: 0, unchanged: toVer.parsedText.split("\n").length },
    };
  }

  const hunks = computeLineDiff(
    fromVer.parsedText.split("\n"),
    toVer.parsedText.split("\n")
  );
  const stats = { added: 0, removed: 0, unchanged: 0 };
  for (const h of hunks) stats[h.type] += h.lines.length;

  return {
    documentId: toVer.documentId,
    fromVersionId: fromVer.id,
    toVersionId: toVer.id,
    isNew: false,
    hasChanges: true,
    hunks,
    stats,
  };
}

// ─── Simple line-level diff (LCS-based) ────────────────────────────

function computeLineDiff(oldLines: string[], newLines: string[]): DiffHunk[] {
  // Build LCS table
  const m = oldLines.length;
  const n = newLines.length;

  // For very large documents, fall back to a fast simple approach
  if (m * n > 500_000) {
    return fastSimpleDiff(oldLines, newLines);
  }

  const dp: number[][] = Array.from({ length: m + 1 }, () => new Array(n + 1).fill(0));
  for (let i = 1; i <= m; i++) {
    for (let j = 1; j <= n; j++) {
      dp[i][j] = oldLines[i - 1] === newLines[j - 1]
        ? dp[i - 1][j - 1] + 1
        : Math.max(dp[i - 1][j], dp[i][j - 1]);
    }
  }

  // Backtrace to build hunks
  const raw: Array<{ type: "added" | "removed" | "unchanged"; line: string }> = [];
  let i = m, j = n;
  while (i > 0 || j > 0) {
    if (i > 0 && j > 0 && oldLines[i - 1] === newLines[j - 1]) {
      raw.push({ type: "unchanged", line: oldLines[i - 1] });
      i--; j--;
    } else if (j > 0 && (i === 0 || dp[i][j - 1] >= dp[i - 1][j])) {
      raw.push({ type: "added", line: newLines[j - 1] });
      j--;
    } else {
      raw.push({ type: "removed", line: oldLines[i - 1] });
      i--;
    }
  }
  raw.reverse();

  // Collapse consecutive same-type entries into hunks
  return collapseToHunks(raw);
}

function fastSimpleDiff(oldLines: string[], newLines: string[]): DiffHunk[] {
  // For very large docs: show all old as removed, all new as added
  const hunks: DiffHunk[] = [];
  if (oldLines.length > 0) hunks.push({ type: "removed", lines: oldLines });
  if (newLines.length > 0) hunks.push({ type: "added", lines: newLines });
  return hunks;
}

function collapseToHunks(
  raw: Array<{ type: "added" | "removed" | "unchanged"; line: string }>
): DiffHunk[] {
  if (raw.length === 0) return [];
  const hunks: DiffHunk[] = [];
  let current: DiffHunk = { type: raw[0].type, lines: [raw[0].line] };
  for (let i = 1; i < raw.length; i++) {
    if (raw[i].type === current.type) {
      current.lines.push(raw[i].line);
    } else {
      hunks.push(current);
      current = { type: raw[i].type, lines: [raw[i].line] };
    }
  }
  hunks.push(current);
  return hunks;
}
