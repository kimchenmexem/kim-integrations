/**
 * RuleBundle publisher.
 *
 * Atomically promotes a draft bundle to "published" and supersedes any
 * previously published bundle for the same locale.
 *
 * Only published bundles may be read by the runtime validation path.
 */

import { Prisma } from "@prisma/client";
import { prisma } from "../../db";
import { invalidateBundle } from "./loader";

export interface PublishResult {
  bundleId: number;
  localeCode: string;
  version: string;
  supersededBundleId: number | null;
}

/**
 * Publish a draft bundle.
 *
 * Transaction:
 *  1. Verify the bundle is in "draft" status.
 *  2. Find any currently-published bundle for the same locale — mark it "superseded".
 *  3. Mark the target bundle as "published".
 *  4. Resolve the associated LegalReviewTask (if any).
 */
export async function publishBundle(
  bundleId: number,
  publishedBy: string,
  outerTx?: Prisma.TransactionClient
): Promise<PublishResult> {
  // Core work is factored out so it runs against either (a) the outer caller's
  // transaction client — when the caller wants to pair publish + audit atomically
  // — or (b) a fresh $transaction we open here when called standalone.
  const runInTx = async (tx: Prisma.TransactionClient): Promise<PublishResult> => {
    const bundle = await tx.ruleBundle.findUnique({ where: { id: bundleId } });
    if (!bundle) throw new Error(`Bundle ${bundleId} not found.`);
    if (bundle.status !== "draft") {
      throw new Error(`Bundle ${bundleId} is "${bundle.status}", not "draft". Cannot publish.`);
    }

    let supersededBundleId: number | null = null;
    const previousPublished = await tx.ruleBundle.findFirst({
      where: { localeCode: bundle.localeCode, status: "published" },
    });
    if (previousPublished) {
      await tx.ruleBundle.update({
        where: { id: previousPublished.id },
        data: { status: "superseded", supersededAt: new Date() },
      });
      supersededBundleId = previousPublished.id;
    }

    await tx.ruleBundle.update({
      where: { id: bundleId },
      data: { status: "published", publishedAt: new Date(), publishedBy },
    });

    await tx.legalReviewTask.updateMany({
      where: {
        refType: "RuleBundle",
        refId: bundleId,
        status: { in: ["open", "in_progress"] },
      },
      data: {
        status: "decided",
        decision: "approved",
        decidedBy: publishedBy,
        decidedAt: new Date(),
      },
    });

    return {
      bundleId,
      localeCode: bundle.localeCode,
      version: bundle.version,
      supersededBundleId,
    };
  };

  const result = outerTx
    ? await runInTx(outerTx)
    : await prisma.$transaction(runInTx);

  // Invalidate the runtime cache immediately so the new bundle is picked up
  // on the next request. Outside any transaction — a rollback of an outer tx
  // would re-invalidate on the next successful publish anyway.
  invalidateBundle(result.localeCode);

  return result;
}

/**
 * Get the currently published bundle for a locale.
 * This is the only function the runtime validation path should call.
 */
export async function getPublishedBundle(localeCode: string) {
  return prisma.ruleBundle.findFirst({
    where: {
      localeCode,
      status: "published",
    },
    orderBy: { publishedAt: "desc" },
  });
}
