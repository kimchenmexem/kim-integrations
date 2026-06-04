import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { requireAuth } from "../middleware/auth";
import { canReadAllReviews, canReadAllJobs, ownerScope } from "../services/access";
import { writeAudit } from "../services/audit";
import { upsertActiveForbiddenPhrase } from "../compliance/forbidden/service";

const router = Router();

const VALID_ISSUE_CODES = [
  "tone",
  "terminology",
  "grammar",
  "fluency",
  "literal_translation",
  "brand_voice",
  "register",
] as const;

const reviewSchema = z.object({
  decision: z.enum(["approved", "rejected"]),
  note: z.string().optional(),
  issueCodes: z
    .array(z.enum(VALID_ISSUE_CODES))
    .optional()
    .default([]),
  correctedTranslation: z.string().optional(),
  reviewerId: z.string().optional(),
  /**
   * Phrases the reviewer wants the AI to never produce again for the
   * output's target locale. Each becomes a ForbiddenPhrase row, scoped to
   * the locale, with `triggeringReviewId` pointing at this review for
   * provenance. Idempotent — duplicate submissions reactivate (not error).
   */
  forbiddenPhrases: z.array(z.string().min(1).max(500)).max(50).optional().default([]),
});

// Create a review for an output. Open to any authenticated user, with
// these rules:
//   • USER role: can only review their OWN translations (must own the parent
//     job). 404 indistinguishably if not — same no-info-leak policy as the
//     existing GET routes.
//   • REVIEWER / MANAGER / ADMIN: can review any output.
//   • The `forbiddenPhrases` field — which seeds the global ForbiddenPhrase
//     compliance list and therefore affects EVERYONE's future translations —
//     is only honoured for REVIEWER+. A USER who includes it gets their
//     decision / note / issueCodes / correctedTranslation stored as normal,
//     but no global write happens. This stops a regular user from poisoning
//     the prompt for the whole organisation.
router.post("/:outputId", requireAuth, async (req, res) => {
  const outputId = Number(req.params.outputId);
  if (Number.isNaN(outputId)) {
    return res.status(400).json({ error: "Invalid output id." });
  }

  try {
    const payload = reviewSchema.parse(req.body);
    const authUser = req.authUser!;

    const output = await prisma.translationOutput.findUnique({
      where: { id: outputId },
      include: {
        job: {
          select: {
            createdByUserId: true,
            targetLocale: true,
            sourceText: true,
            sourceLanguage: true,
            textType: true,
          },
        },
      },
    });
    if (!output) {
      return res.status(404).json({ error: "Output not found." });
    }

    // Ownership gate for plain USER. canReadAllJobs() returns false for USER
    // and true for REVIEWER+ — same predicate the GET ownership scope uses.
    if (!canReadAllJobs(authUser.role) && output.job.createdByUserId !== authUser.id) {
      return res.status(404).json({ error: "Output not found." });
    }

    // forbiddenPhrases stays REVIEWER+ only. We silently drop it for plain
    // USERs (they can still submit decision/note/correctedTranslation).
    const allowedToSeedGlobalBans = canReadAllReviews(authUser.role);
    const honouredForbiddenPhrases = allowedToSeedGlobalBans ? payload.forbiddenPhrases : [];
    const targetLocale = output.job.targetLocale;
    const trimmedCorrection = payload.correctedTranslation?.trim() ?? "";
    const hasCorrection = trimmedCorrection.length > 0;

    const review = await prisma.$transaction(async (tx) => {
      // Create the review record — reviewerUserId is the authoritative actor
      // identity; the legacy free-form `reviewerId` is kept for backward compat.
      const created = await tx.translationReview.create({
        data: {
          outputId,
          decision: payload.decision,
          note: payload.note,
          issueCodes: payload.issueCodes.length
            ? JSON.stringify(payload.issueCodes)
            : null,
          correctedTranslation: payload.correctedTranslation,
          reviewerId: payload.reviewerId,
          reviewerUserId: authUser.id,
        },
      });

      // Also update the output's approved flag for backward compat
      const updatedOutput = await tx.translationOutput.update({
        where: { id: outputId },
        data: {
          approved: payload.decision === "approved",
          reviewNote: payload.note,
        },
      });

      // Append a history snapshot for the post-update output state. Version
      // number is (max + 1) for this output — the @@unique constraint
      // enforces monotonicity; a race between two concurrent reviews on the
      // same output will lose one transaction to a unique violation, which
      // is the correct failure mode (no interleaved state loss).
      const lastVersion = await tx.translationOutputVersion.findFirst({
        where: { translationOutputId: outputId },
        orderBy: { versionNumber: "desc" },
        select: { versionNumber: true },
      });
      await tx.translationOutputVersion.create({
        data: {
          translationOutputId: outputId,
          versionNumber: (lastVersion?.versionNumber ?? 0) + 1,
          eventType: "review_update",
          outputText: updatedOutput.outputText,
          correctedTranslation: payload.correctedTranslation ?? null,
          approved: updatedOutput.approved,
          reviewNote: updatedOutput.reviewNote,
          score: updatedOutput.score,
          issueCodesJson: payload.issueCodes.length
            ? JSON.stringify(payload.issueCodes)
            : null,
          triggeringReviewId: created.id,
          createdByUserId: authUser.id,
        },
      });

      // Corrected translation → TranslationMemoryEntry. This is the
      // \"learn from reviews\" loop: when a reviewer provides a corrected
      // text, it becomes a TM entry. The retrieval service
      // (services/translationMemoryRetrieval.ts) pulls TM entries scoped
      // by targetLocale + textType and feeds them to the AI as few-shot
      // examples on subsequent translations. So future translations of
      // similar source text see the reviewer's preferred wording.
      //
      // Conditions: correctedTranslation is non-empty AND differs from the
      // AI's output (no point storing an identical entry). De-dup over
      // (sourceText, targetText, targetLocale, textType) is not enforced
      // by the schema, so we check manually to avoid clutter.
      if (hasCorrection && trimmedCorrection !== output.outputText.trim()) {
        const dupe = await tx.translationMemoryEntry.findFirst({
          where: {
            sourceText: output.job.sourceText,
            targetText: trimmedCorrection,
            targetLocale: output.job.targetLocale,
            textType: output.job.textType,
          },
          select: { id: true },
        });
        if (!dupe) {
          await tx.translationMemoryEntry.create({
            data: {
              sourceText: output.job.sourceText,
              targetText: trimmedCorrection,
              sourceLanguage: output.job.sourceLanguage,
              targetLocale: output.job.targetLocale,
              textType: output.job.textType,
              createdByUserId: authUser.id,
            },
          });
        }
      }

      // Reviewer-flagged compliance phrases — REVIEWER+ only. Plain USERs
      // can still submit a decision/note/correctedTranslation, but we don't
      // let them seed the global ForbiddenPhrase table from their review,
      // because that affects every other user's future translations.
      for (const raw of honouredForbiddenPhrases) {
        const phrase = raw.trim();
        if (!phrase) continue;
        await upsertActiveForbiddenPhrase({
          phrase,
          localeCode: targetLocale,
          reason: payload.note ?? "reviewer-flagged via review submission",
          addedByUserId: authUser.id,
          triggeringReviewId: created.id,
        }, tx);
      }

      return created;
    });

    // review.approve / review.reject — log actor + decision + structured
    // issue codes. The correctedTranslation field is deliberately excluded
    // (can be arbitrarily long) — its id is captured via entityId.
    await writeAudit(req, {
      action: payload.decision === "approved" ? "review.approve" : "review.reject",
      entityType: "TranslationReview",
      entityId: review.id,
      after: {
        id: review.id,
        outputId,
        decision: payload.decision,
        issueCodes: payload.issueCodes,
        note: payload.note ?? null,
        correctedTranslationLength: payload.correctedTranslation?.length ?? 0,
        reviewerUserId: authUser.id,
        // Distinguish between "reviewer requested" and "actually applied" so
        // the audit row shows when a USER's forbiddenPhrases got dropped.
        forbiddenPhrasesRequested: payload.forbiddenPhrases.length,
        forbiddenPhrasesApplied: honouredForbiddenPhrases.length,
        actorRole: authUser.role,
        // True when this review's correctedTranslation seeded a TM entry
        // that future translations will see as a few-shot example.
        correctedTranslationFedTM: hasCorrection && trimmedCorrection !== output.outputText.trim(),
      },
    });

    res.status(201).json({ review });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Unable to create review." });
  }
});

// Get version history for an output. Anchored on TranslationOutput — returns
// every TranslationOutputVersion in ascending versionNumber order. Same
// ownership/RBAC rules as the review GET: USER sees only their own jobs'
// outputs; REVIEWER+ sees all. On mismatch, return 404 (no info leak about
// the existence of other users' outputs).
router.get("/:outputId/history", requireAuth, async (req, res) => {
  const outputId = Number(req.params.outputId);
  if (Number.isNaN(outputId)) {
    return res.status(400).json({ error: "Invalid output id." });
  }

  const authUser = req.authUser!;

  if (!canReadAllReviews(authUser.role)) {
    const output = await prisma.translationOutput.findFirst({
      where: {
        id: outputId,
        job: ownerScope(authUser, canReadAllJobs, "createdByUserId"),
      },
      select: { id: true },
    });
    if (!output) return res.status(404).json({ error: "Not found." });
  }

  const versions = await prisma.translationOutputVersion.findMany({
    where: { translationOutputId: outputId },
    orderBy: { versionNumber: "asc" },
    select: {
      id: true,
      versionNumber: true,
      eventType: true,
      outputText: true,
      correctedTranslation: true,
      approved: true,
      reviewNote: true,
      score: true,
      issueCodesJson: true,
      triggeringReviewId: true,
      createdByUserId: true,
      createdAt: true,
    },
  });

  res.json({ versions });
});

// Get all reviews for an output. USER sees reviews only for outputs of jobs
// they own; REVIEWER+ sees all reviews.
router.get("/:outputId", requireAuth, async (req, res) => {
  const outputId = Number(req.params.outputId);
  if (Number.isNaN(outputId)) {
    return res.status(400).json({ error: "Invalid output id." });
  }

  const authUser = req.authUser!;

  if (!canReadAllReviews(authUser.role)) {
    // USER: confirm the output belongs to a job they own, else 404.
    const output = await prisma.translationOutput.findFirst({
      where: {
        id: outputId,
        job: ownerScope(authUser, canReadAllJobs, "createdByUserId"),
      },
      select: { id: true },
    });
    if (!output) return res.status(404).json({ error: "Not found." });
  }

  const reviews = await prisma.translationReview.findMany({
    where: { outputId },
    orderBy: { createdAt: "desc" },
  });

  res.json({ reviews });
});

export default router;
