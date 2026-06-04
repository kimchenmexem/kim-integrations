import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { runTranslationJob, TranslationOutputWithQuality } from "../services/ai";
import { validateLength } from "../services/validation";
import { persistQualityReviews } from "../services/qualityGate";
import { TranslationRequest, TranslationOutput } from "@mexem/shared";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { canReadAllJobs, ownerScope } from "../services/access";
import { writeAudit } from "../services/audit";
import { mapTranslateError } from "../services/translateErrors";

const router = Router();

const lengthConstraintSchema = z.object({
  mode: z.enum(["exact", "near", "max", "range"]),
  exactChars: z.number().optional(),
  maxChars: z.number().optional(),
  maxWords: z.number().optional(),
  minChars: z.number().optional(),
  maxCharsRange: z.number().optional(),
  minWords: z.number().optional(),
  maxWordsRange: z.number().optional()
});

const requestSchema = z.object({
  sourceText: z.string().min(1),
  sourceLanguage: z.string().min(2),
  targetLocale: z.enum(["it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES", "en-GB"]),
  textType: z.string(),
  persona: z.string(),
  tone: z.union([z.string(), z.array(z.string())]),
  lengthConstraint: lengthConstraintSchema,
  requiredTerms: z.array(z.string()).optional(),
  forbiddenTerms: z.array(z.string()).optional(),
  complianceNotes: z.string().optional(),
  campaignContext: z.string().optional(),
  outputCount: z.number().min(1).max(5).optional(),
  existingVersions: z.array(z.string()).optional(),
  versionOffset: z.number().min(0).optional()
});

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  try {
    const payload = requestSchema.parse(req.body);
    const outputCount = payload.outputCount ?? 1;

    const authUser = req.authUser!;
    const job = await prisma.translationJob.create({
      data: {
        sourceText: payload.sourceText,
        sourceLanguage: payload.sourceLanguage,
        targetLocale: payload.targetLocale,
        textType: payload.textType,
        persona: payload.persona,
        tone: Array.isArray(payload.tone) ? payload.tone.join(", ") : payload.tone,
        lengthConstraint: JSON.stringify(payload.lengthConstraint),
        requiredTerms: payload.requiredTerms?.join(", "),
        forbiddenTerms: payload.forbiddenTerms?.join(", "),
        complianceNotes: payload.complianceNotes,
        campaignContext: payload.campaignContext,
        outputCount,
        status: "running",
        createdByUserId: authUser.id,
      }
    });

    try {
      const outputs = await runTranslationJob({ ...payload, outputCount });

      const savedOutputs = await prisma.$transaction(async (tx) => {
        const saved = await Promise.all(
          outputs.map(async (output) => {
            const record = await tx.translationOutput.create({
              data: {
                jobId: job.id,
                outputText: output.outputText,
                version: output.version,
                score: output.score,
                validation: JSON.stringify(output.validation)
              }
            });

            // v1 of the output — the initial generated state. Written in the
            // same transaction as the parent row so no output can ever exist
            // without a version-1 snapshot.
            await tx.translationOutputVersion.create({
              data: {
                translationOutputId: record.id,
                versionNumber: 1,
                eventType: "initial_generation",
                outputText: record.outputText,
                approved: record.approved,
                reviewNote: record.reviewNote,
                score: record.score,
                createdByUserId: authUser.id,
              },
            });

            await tx.translationMemoryEntry.create({
              data: {
                sourceText: payload.sourceText,
                targetText: output.outputText,
                sourceLanguage: payload.sourceLanguage,
                targetLocale: payload.targetLocale,
                textType: payload.textType,
                createdByUserId: authUser.id,
              }
            });

            return { record, qualityGateResult: output._qualityGateResult, qualityGate: output.qualityGate, marketContext: (output as any).marketContext };
          })
        );

        await tx.translationJob.update({
          where: { id: job.id },
          data: { status: "completed" }
        });

        return saved;
      });

      // Persist quality reviews outside the transaction (non-blocking)
      for (const { record, qualityGateResult } of savedOutputs) {
        if (qualityGateResult) {
          persistQualityReviews(record.id, qualityGateResult).catch(err =>
            console.error("Failed to persist quality review:", err)
          );
        }
      }

      // Build response — additive: includes qualityGate field alongside existing fields
      const response = savedOutputs.map(({ record, qualityGate, marketContext }) => ({
        ...record,
        validation: record.validation ? JSON.parse(record.validation) : null,
        qualityGate,
        marketContext: marketContext ?? { applied: false },
      }));

      // Audit job creation with operational metadata only. Rationale: the
      // translation source/output text is arbitrary user copy; dumping it
      // verbatim into an audit log would duplicate the TranslationJob table
      // and store large/potentially sensitive marketing content twice. The
      // TranslationJob row itself is the source of truth for content; the
      // audit row records *who* created *which* job in *which* context.
      await writeAudit(req, {
        action: "translate.create",
        entityType: "TranslationJob",
        entityId: job.id,
        after: {
          jobId: job.id,
          targetLocale: payload.targetLocale,
          sourceLanguage: payload.sourceLanguage,
          textType: payload.textType,
          persona: payload.persona,
          outputCount,
          sourceTextLength: payload.sourceText.length,
          savedOutputCount: savedOutputs.length,
          status: "completed",
        },
      });

      res.json({ jobId: job.id, outputs: response });
    } catch (innerError) {
      await prisma.translationJob.update({
        where: { id: job.id },
        data: { status: "failed" }
      }).catch(() => {});
      throw innerError;
    }
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("POST /api/translate failed:", error);
    const mapped = mapTranslateError(error, "Unable to process translation request.");
    res.status(mapped.status).json(mapped.body);
  }
}));

router.get("/:jobId", requireAuth, asyncHandler(async (req, res) => {
  const jobId = Number(req.params.jobId);
  if (Number.isNaN(jobId)) {
    return res.status(400).json({ error: "Invalid job id." });
  }

  const authUser = req.authUser!;
  // Ownership-scoped lookup: USER sees only their own jobs. REVIEWER/MANAGER/
  // ADMIN see all. We use findFirst + scoped where (rather than findUnique +
  // post-check) so forbidden rows never leave the DB layer.
  const job = await prisma.translationJob.findFirst({
    where: {
      id: jobId,
      ...ownerScope(authUser, canReadAllJobs, "createdByUserId"),
    },
    include: { outputs: { include: { qualityReviews: true } } }
  });

  if (!job) {
    // Indistinguishable from "does not exist" on purpose — no info leak.
    return res.status(404).json({ error: "Translation job not found." });
  }

  res.json(job);
}));

export default router;
