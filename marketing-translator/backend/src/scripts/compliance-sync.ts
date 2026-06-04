/**
 * CLI — compliance source sync
 *
 * Runs the ingestion orchestrator for one or all sources.
 *
 * Usage:
 *   npm --workspace backend run compliance:sync              # all sources with adapters
 *   npm --workspace backend run compliance:sync -- --source FCA   # single source
 *   npm --workspace backend run compliance:sync -- --all         # all 9 sources (including manual-only)
 */

import { prisma } from "../db";
import { runSync, SyncRunSummary } from "../compliance/ingestion/orchestrator";
import { getAdapter, getDedicatedAdapterCodes } from "../compliance/ingestion/adapters";
import { diffLatestVersions, DiffResult } from "../compliance/ingestion/diff";
import type { SourceFamilyCode } from "@mexem/shared";

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = getFlagValue(args, "--source");
  const allFlag = args.includes("--all");

  let codes: SourceFamilyCode[];
  if (sourceArg) {
    codes = [sourceArg.toUpperCase() as SourceFamilyCode];
  } else if (allFlag) {
    const rows = await prisma.regulatorySource.findMany({
      where: { active: true },
      select: { code: true },
      orderBy: { code: "asc" },
    });
    codes = rows.map((r) => r.code as SourceFamilyCode);
  } else {
    codes = getDedicatedAdapterCodes();
  }

  console.log(`\n🔄 Compliance sync — ${codes.length} source(s): ${codes.join(", ")}\n`);

  const summaries: SyncRunSummary[] = [];

  for (const code of codes) {
    const adapter = getAdapter(code);
    console.log(`── ${code} ─────────────────────────────────`);
    const summary = await runSync(adapter, "manual:cli");
    summaries.push(summary);

    console.log(`   status:     ${summary.status}`);
    console.log(`   docs:       ${summary.documentsUpserted} upserted`);
    console.log(`   versions:   ${summary.versionsCreated} created, ${summary.versionsSkipped} skipped (dup)`);
    console.log(`   duration:   ${summary.durationMs}ms`);
    if (summary.warnings.length) {
      for (const w of summary.warnings) console.log(`   ⚠  ${w}`);
    }
    if (summary.errors.length) {
      for (const e of summary.errors) console.log(`   ✖  ${e}`);
    }

    // Run diff detection on documents that got new versions
    if (summary.versionsCreated > 0) {
      const docs = await prisma.sourceDocument.findMany({
        where: { source: { code } },
        select: { id: true, externalRef: true },
      });
      for (const doc of docs) {
        const diff = await diffLatestVersions(doc.id);
        if (diff && diff.hasChanges) {
          const label = diff.isNew ? "NEW" : "CHANGED";
          console.log(`   📄 ${label}: ${doc.externalRef} (+${diff.stats.added}/-${diff.stats.removed})`);
        }
      }
    }
    console.log("");
  }

  // Final summary
  const total = summaries.reduce(
    (acc, s) => ({
      docs: acc.docs + s.documentsUpserted,
      created: acc.created + s.versionsCreated,
      skipped: acc.skipped + s.versionsSkipped,
    }),
    { docs: 0, created: 0, skipped: 0 }
  );

  console.log("═══════════════════════════════════════");
  console.log(`Total: ${total.docs} documents, ${total.created} new versions, ${total.skipped} skipped`);
  console.log("═══════════════════════════════════════\n");
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  if (idx < 0 || idx >= args.length - 1) return undefined;
  return args[idx + 1];
}

main()
  .catch((err) => {
    console.error("Sync failed:", err);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
