/**
 * Compliance source-sync cron.
 *
 * Runs the same orchestrator the manual `compliance-sync` CLI uses, but
 * on a schedule. Only the sources that have a dedicated adapter (EUR_LEX,
 * FCA, ESMA today) are polled — manual-only sources are left alone.
 *
 * Gated by env so it doesn't fire in local dev or on Render preview deploys
 * unless explicitly turned on:
 *   COMPLIANCE_SYNC_CRON_ENABLED=true     # default off
 *   COMPLIANCE_SYNC_CRON_EXPR="0 6 * * *" # default 06:00 UTC daily
 *
 * The cron only schedules the task; the actual sync runs sequentially per
 * adapter inside one promise to avoid hitting upstream regulators in
 * parallel. Failures are logged but never crash the process.
 *
 * Render note: this is an in-process cron. If the web service is asleep
 * (free-tier dyno), the cron will not fire until something wakes the
 * service. For guaranteed scheduling, point Render Cron Jobs at the
 * `compliance:sync` npm script instead.
 */

import cron from "node-cron";
import { runSync } from "../compliance/ingestion/orchestrator";
import { getAdapter, getDedicatedAdapterCodes } from "../compliance/ingestion/adapters";
import { diffLatestVersions } from "../compliance/ingestion/diff";
import { prisma } from "../db";

const DEFAULT_EXPR = "0 6 * * *"; // 06:00 UTC every day

let scheduled = false;
let runningPromise: Promise<void> | null = null;

/** Sequentially sync every dedicated adapter and run diff detection on new versions. */
export async function runScheduledSync(triggeredBy: string = "scheduled:cron"): Promise<void> {
  if (runningPromise) {
    console.log("[compliance-sync-cron] previous run still in flight — skipping this tick");
    return runningPromise;
  }
  runningPromise = (async () => {
    const codes = getDedicatedAdapterCodes();
    console.log(`[compliance-sync-cron] starting (${codes.length} sources: ${codes.join(", ")})`);
    const startedAt = Date.now();

    for (const code of codes) {
      try {
        const adapter = getAdapter(code);
        const summary = await runSync(adapter, triggeredBy);
        console.log(
          `[compliance-sync-cron] ${code}: ${summary.status} — ` +
          `docs=${summary.documentsUpserted}, versionsNew=${summary.versionsCreated}, ` +
          `skipped=${summary.versionsSkipped}, durMs=${summary.durationMs}` +
          (summary.errors.length ? `, errors=${summary.errors.length}` : ""),
        );

        if (summary.versionsCreated > 0) {
          const docs = await prisma.sourceDocument.findMany({
            where: { source: { code } },
            select: { id: true, externalRef: true },
          });
          let changed = 0;
          for (const doc of docs) {
            const diff = await diffLatestVersions(doc.id);
            if (diff && diff.hasChanges) {
              changed++;
              console.log(
                `[compliance-sync-cron] ${code} ${diff.isNew ? "NEW" : "CHANGED"}: ` +
                `${doc.externalRef} (+${diff.stats.added}/-${diff.stats.removed})`,
              );
            }
          }
          if (changed > 0) {
            console.log(`[compliance-sync-cron] ${code} produced ${changed} diff(s) → legal-review queue`);
          }
        }
      } catch (err: any) {
        console.error(`[compliance-sync-cron] ${code} threw:`, err?.message ?? err);
      }
    }

    console.log(`[compliance-sync-cron] finished in ${Date.now() - startedAt}ms`);
  })();

  try {
    await runningPromise;
  } finally {
    runningPromise = null;
  }
}

/**
 * Register the daily cron. Idempotent — safe to call from app boot once.
 * Returns true if the cron was scheduled, false if disabled by env.
 */
export function startComplianceSyncCron(): boolean {
  if (scheduled) return true;
  if (process.env.COMPLIANCE_SYNC_CRON_ENABLED !== "true") {
    return false;
  }

  const expr = process.env.COMPLIANCE_SYNC_CRON_EXPR ?? DEFAULT_EXPR;
  if (!cron.validate(expr)) {
    console.error(`[compliance-sync-cron] invalid cron expression "${expr}" — cron NOT started`);
    return false;
  }

  cron.schedule(expr, () => {
    runScheduledSync("scheduled:cron").catch((err) => {
      console.error("[compliance-sync-cron] unexpected top-level failure:", err);
    });
  }, { timezone: "UTC" });

  scheduled = true;
  console.log(`[compliance-sync-cron] scheduled "${expr}" UTC (sources: ${getDedicatedAdapterCodes().join(", ")})`);
  return true;
}
