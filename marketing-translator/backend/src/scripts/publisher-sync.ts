/**
 * CLI — publisher source sync.
 *
 * Usage:
 *   npm --workspace backend run publisher:sync                      # all active sources
 *   npm --workspace backend run publisher:sync -- --source FD_NL    # single source
 *   npm --workspace backend run publisher:sync -- --country IT      # all Italian sources
 */

import { prisma } from "../db";
import { runPublisherSync, PublisherSyncSummary } from "../publishers/ingestion/orchestrator";

async function main() {
  const args = process.argv.slice(2);
  const sourceArg = getFlagValue(args, "--source");
  const countryArg = getFlagValue(args, "--country");

  let codes: string[];
  if (sourceArg) {
    codes = [sourceArg.toUpperCase()];
  } else {
    const where: Record<string, unknown> = { active: true };
    if (countryArg) where.country = countryArg.toUpperCase();
    const rows = await prisma.publisherSource.findMany({ where, select: { code: true }, orderBy: { code: "asc" } });
    codes = rows.map(r => r.code);
  }

  console.log(`\n📰 Publisher sync — ${codes.length} source(s): ${codes.join(", ")}\n`);

  const summaries: PublisherSyncSummary[] = [];

  for (const code of codes) {
    console.log(`── ${code} ─────────────────────────────────`);
    try {
      const s = await runPublisherSync(code, "manual:cli");
      summaries.push(s);
      console.log(`   status:    ${s.status}`);
      console.log(`   fetched:   ${s.itemsFetched}`);
      console.log(`   created:   ${s.itemsCreated}, skipped: ${s.itemsSkipped}, filtered: ${s.itemsFiltered}`);
      console.log(`   duration:  ${s.durationMs}ms`);
      for (const w of s.warnings) console.log(`   ⚠  ${w}`);
      for (const e of s.errors) console.log(`   ✖  ${e}`);
    } catch (err: any) {
      console.log(`   ✖  ${err.message}`);
    }
    console.log("");
  }

  const total = summaries.reduce((a, s) => ({
    fetched: a.fetched + s.itemsFetched,
    created: a.created + s.itemsCreated,
    skipped: a.skipped + s.itemsSkipped,
    filtered: a.filtered + s.itemsFiltered,
  }), { fetched: 0, created: 0, skipped: 0, filtered: 0 });

  console.log("═══════════════════════════════════════");
  console.log(`Total: ${total.fetched} fetched, ${total.created} created, ${total.skipped} skipped, ${total.filtered} filtered`);
  console.log("═══════════════════════════════════════\n");
}

function getFlagValue(args: string[], flag: string): string | undefined {
  const idx = args.indexOf(flag);
  return idx >= 0 && idx < args.length - 1 ? args[idx + 1] : undefined;
}

main()
  .catch(err => { console.error("Sync failed:", err); process.exit(1); })
  .finally(() => prisma.$disconnect());
