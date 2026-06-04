/**
 * Quick Translate — simple text-in / translated-text-out endpoint.
 *
 * No compliance validation. No quality gate. No market intelligence.
 * Just translate the source text to the target locale's language.
 *
 * Supports translating into multiple locales in one request.
 */

import { Router } from "express";
import { z } from "zod";
import { translateToLocale } from "../services/ai";
import { requireAuth } from "../middleware/auth";
import { mapTranslateError } from "../services/translateErrors";
import { prisma } from "../db";

const router = Router();

const SUPPORTED_LOCALES = [
  "it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES", "en-GB",
] as const;

const LOCALE_LABELS: Record<string, { language: string; country: string }> = {
  "it-IT": { language: "Italian", country: "Italy" },
  "fr-FR": { language: "French", country: "France" },
  "nl-NL": { language: "Dutch", country: "Netherlands" },
  "nl-BE": { language: "Dutch", country: "Belgium" },
  "fr-BE": { language: "French", country: "Belgium" },
  "es-ES": { language: "Spanish", country: "Spain" },
  "en-GB": { language: "English", country: "United Kingdom" },
};

const quickTranslateSchema = z.object({
  text: z.string().min(1).max(5000),
  locales: z.array(z.enum(SUPPORTED_LOCALES)).min(1).max(7),
});

router.post("/", requireAuth, async (req, res) => {
  try {
    const { text, locales } = quickTranslateSchema.parse(req.body);
    const authUser = req.authUser!;

    // Run all OpenAI calls in parallel (no DB inside the limited concurrency
    // bracket — keeps the OpenAI fan-out independent from the persist step).
    const translatedByLocale = await Promise.all(
      locales.map(async (locale) => ({
        locale,
        translatedText: await translateToLocale(text, locale),
      }))
    );

    // Persist one (TranslationJob, TranslationOutput, v1 history row, TM
    // entry) per locale so each result has an outputId the UI can review
    // against. Single $transaction across all locales for atomicity — if
    // any one persist fails, none of the cells are saved (translation
    // results are still computed and would have to be re-issued; in
    // practice this only fails if Postgres is unreachable).
    const persisted = await prisma.$transaction(async (tx) => {
      return Promise.all(
        translatedByLocale.map(async ({ locale, translatedText }) => {
          const job = await tx.translationJob.create({
            data: {
              sourceText: text,
              sourceLanguage: "auto",
              targetLocale: locale,
              textType: "quick_translate",
              persona: "quick",
              tone: "quick",
              outputCount: 1,
              status: "completed",
              createdByUserId: authUser.id,
            },
          });
          const output = await tx.translationOutput.create({
            data: {
              jobId: job.id,
              outputText: translatedText,
              version: 1,
              approved: false,
            },
          });
          await tx.translationOutputVersion.create({
            data: {
              translationOutputId: output.id,
              versionNumber: 1,
              eventType: "initial_generation",
              outputText: translatedText,
              approved: false,
              createdByUserId: authUser.id,
            },
          });
          await tx.translationMemoryEntry.create({
            data: {
              sourceText: text,
              targetText: translatedText,
              sourceLanguage: "auto",
              targetLocale: locale,
              textType: "quick_translate",
              createdByUserId: authUser.id,
            },
          });
          return { locale, translatedText, outputId: output.id, jobId: job.id };
        })
      );
    });

    const results = persisted.map((p) => {
      const meta = LOCALE_LABELS[p.locale] ?? { language: p.locale, country: p.locale };
      return {
        locale: p.locale,
        language: meta.language,
        country: meta.country,
        translatedText: p.translatedText,
        charCount: p.translatedText.length,
        outputId: p.outputId,
        jobId: p.jobId,
      };
    });

    res.json({
      sourceText: text,
      sourceCharCount: text.length,
      translations: results,
    });
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error("POST /api/translate/quick failed:", err);
    const mapped = mapTranslateError(err, "Translation failed.");
    res.status(mapped.status).json(mapped.body);
  }
});

export default router;
