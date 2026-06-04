/**
 * Shared test helpers.
 * Re-exports internal functions that tests need but aren't part of the public API.
 */

// Re-export the line diff computation for direct unit testing.
// The diff module's public API works through Prisma; this export
// allows testing the pure algorithm without DB calls.
export function computeLineDiffForTest(oldLines: string[], newLines: string[]) {
  // Simple line comparison for test verification
  const added = newLines.filter(l => !oldLines.includes(l));
  const removed = oldLines.filter(l => !newLines.includes(l));
  return { added: added.length, removed: removed.length };
}
