import { Router } from "express";
import { z } from "zod";
import { runQualityGate, QualityGateResult } from "../services/qualityGate";
import { loadBundle, LoadedBundle } from "../compliance/bundles/loader";
import { executeBundleRules, BundleRuleMatch } from "../compliance/engine/executor";
import { buildGlossaryPrompt } from "../services/glossary";
import { extractTranslation, EmptyTranslationError, lazyOpenAI } from "../services/openaiHelpers";
import { asyncHandler } from "../middleware/asyncHandler";
import { requireAuth } from "../middleware/auth";
import { mapTranslateError } from "../services/translateErrors";
import {
  listActiveForbiddenPhrasesForLocale,
  formatForbiddenPhrasesBlock,
} from "../compliance/forbidden/service";
import { getLocaleStyleGuide } from "../services/ai";
import { prisma } from "../db";

const router = Router();
const openai = lazyOpenAI(60_000);

// Simple concurrency limiter
function pLimit(concurrency: number) {
  let active = 0;
  const queue: (() => void)[] = [];
  const next = () => { if (queue.length > 0 && active < concurrency) { active++; queue.shift()!(); } };
  return <T>(fn: () => Promise<T>): Promise<T> =>
    new Promise<T>((resolve, reject) => {
      const run = () => fn().then(resolve, reject).finally(() => { active--; next(); });
      queue.push(run);
      next();
    });
}

const limit = pLimit(10);

const LOCALES = ["it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES", "en-GB"] as const;

const LOCALE_LANGUAGE: Record<string, string> = {
  "it-IT": "Italian", "fr-FR": "French", "nl-NL": "Dutch",
  "nl-BE": "Dutch (Belgium)", "fr-BE": "French (Belgium)", "es-ES": "Spanish", "en-GB": "English (UK)",
};

function buildSystemPrompt(locale: string, maxChars?: number, formatContext?: string, bundle?: LoadedBundle | null, glossaryBlock?: string, forbiddenBlock?: string): string {
  const language = LOCALE_LANGUAGE[locale] || locale;
  const limitInstruction = maxChars
    ? `\nCHARACTER LIMIT: The result MUST be ${maxChars} characters or fewer. Condense as needed while preserving the core meaning and marketing impact.`
    : "";
  const formatInstruction = formatContext ? `\nFORMAT: This is for: ${formatContext}.` : "";

  // If a published bundle provides banned phrases, inject them into the prompt
  const bannedPhrases = bundle?.content.bannedPhrases ?? [];
  const bannedInstruction = bannedPhrases.length > 0
    ? `\nCOMPLIANCE — BANNED WORDS/PHRASES (NEVER use any of these): ${bannedPhrases.join(", ")}.`
    : "";

  // Locale-specific register / style (e.g. it-IT must use the "tu" form,
  // not "Lei"; fr-FR uses "vous"; etc.). Shared with Single + Quick.
  const styleGuide = getLocaleStyleGuide(locale);
  const styleBlock = styleGuide ? `\n\n${styleGuide}` : "";

  return `You are an expert marketing copywriter and translator for MEXEM, a regulated European trading platform.

TASK: Translate the following marketing text into ${language} (${locale}).

TRANSLATION PRINCIPLES:
- This is marketing localisation, not literal translation. The output must read as if it were originally written in ${language} by a native-speaking copywriter.
- Adapt sentence structure, rhythm, and phrasing to what sounds natural in ${language}. Do not mirror English syntax.
- Preserve the marketing intent and persuasive strength.
- Preserve brand names (MEXEM, WisdomTree, etc.) and asterisks (*) exactly as written.
- Do not add, remove, or invent information.
- Use factual, professional language. Never imply guaranteed returns, capital safety, or urgency.
- Output only the translated text, nothing else.${styleBlock}${formatInstruction}${limitInstruction}${bannedInstruction}${forbiddenBlock ?? ""}${glossaryBlock ?? ""}`;
}

// Mirror of /api/options textTypes — when `textType` is supplied without an
// explicit `maxChars`, the batch endpoint applies the platform-conventional
// limit for that type (Google Search 30, Meta primary 125, email_subject 60,
// email_body 600, etc.). Keep in sync with TEXT_TYPE_DEFAULT_MAX_CHARS in
// services/ai.ts.
const TEXT_TYPE_DEFAULT_MAX_CHARS: Record<string, number> = {
  google_search_headline: 30,
  google_search_description: 90,
  google_display_headline: 30,
  google_display_long_headline: 90,
  google_display_description: 90,
  google_pmax_headline: 30,
  google_pmax_long_headline: 90,
  google_pmax_description: 90,
  google_youtube_headline: 30,
  google_youtube_description: 90,
  meta_primary_text: 125,
  meta_headline: 40,
  meta_description: 30,
  meta_long_headline: 100,
  push_notification: 120,
  sms: 160,
  landing_headline: 80,
  banner: 60,
  cta_button: 24,
  email_subject: 60,
  email_body: 600,
};

const batchRequestSchema = z.object({
  texts: z.array(z.string().min(1)).min(1).max(50),
  locales: z.array(z.enum(LOCALES)).min(1),
  maxChars: z.number().optional(),
  // Optional textType — when set without explicit maxChars, the endpoint
  // applies the per-textType platform default so emails / Google Ads / etc.
  // get sensible length guidance even when the operator forgets to set it.
  textType: z.string().optional(),
  formatContext: z.string().optional(),
});

router.post("/", requireAuth, asyncHandler(async (req, res) => {
  try {
    const payload = batchRequestSchema.parse(req.body);
    // Resolve the effective max-chars: explicit payload value wins; falls
    // back to the per-textType default when textType is set; otherwise
    // undefined (model writes free-form).
    const effectiveMaxChars =
      payload.maxChars ??
      (payload.textType
        ? TEXT_TYPE_DEFAULT_MAX_CHARS[payload.textType]
        : undefined);

    // Pre-load bundles for all requested locales (one DB query each, cached)
    const bundlesByLocale = new Map<string, LoadedBundle | null>();
    await Promise.all(
      payload.locales.map(async (locale) => {
        bundlesByLocale.set(locale, await loadBundle(locale));
      })
    );

    const results = await Promise.all(
      payload.texts.map(async (text) => {
        const translations: Record<string, {
          status: "ok" | "failed";
          text: string;
          error?: string;
          qualityGate?: { score: number; approved: boolean; stage: string };
          bundleVersion?: string | null;
          sourceRefs?: unknown[];
          bundleRuleMatches?: BundleRuleMatch[];
          outputId?: number;
          jobId?: number;
        }> = {};
        await Promise.all(
          payload.locales.map((locale) =>
            limit(async () => {
              try {
                const bundle = bundlesByLocale.get(locale) ?? null;
                const glossaryBlock = await buildGlossaryPrompt(text, locale);
                const forbiddenPhrases = await listActiveForbiddenPhrasesForLocale(locale);
                const forbiddenBlock = formatForbiddenPhrasesBlock(forbiddenPhrases);
                const systemPrompt = buildSystemPrompt(locale, effectiveMaxChars, payload.formatContext, bundle, glossaryBlock, forbiddenBlock);
                let translated = await translate(text, systemPrompt);

                // If still over limit after translation, shorten it
                if (effectiveMaxChars && translated.length > effectiveMaxChars) {
                  translated = await shorten(translated, locale, effectiveMaxChars);
                }

                // Run through the shared quality gate
                const qgResult = await runQualityGate(
                  text,
                  translated,
                  locale,
                  "batch",
                  "English",
                  systemPrompt
                );

                // If the quality gate changed the text, re-check length
                let finalText = qgResult.outputText;
                if (effectiveMaxChars && finalText.length > effectiveMaxChars) {
                  finalText = await shorten(finalText, locale, effectiveMaxChars);
                }

                // Run bundle deterministic rules on the final text
                const bundleExec = bundle ? executeBundleRules(finalText, bundle) : null;

                translations[locale] = {
                  status: "ok",
                  text: finalText,
                  qualityGate: {
                    score: qgResult.qualityScore,
                    approved: qgResult.qualityApproved,
                    stage: qgResult.stage,
                  },
                  bundleVersion: bundleExec?.bundleVersion ?? null,
                  sourceRefs: bundleExec?.sourceRefs ?? [],
                  bundleRuleMatches: bundleExec?.matches ?? [],
                  // outputId/jobId filled in after the persist pass below.
                };
              } catch (cellError: any) {
                // Narrow: only provider/model empty-content failures are per-cell.
                // Infra/config/DB/QG errors must bubble to the outer handler.
                if (cellError instanceof EmptyTranslationError) {
                  console.error(`[batch] cell empty-content (locale=${locale}):`, cellError);
                  translations[locale] = {
                    status: "failed",
                    text: "",
                    error: "Model returned empty response.",
                  };
                  return;
                }
                throw cellError;
              }
            })
          )
        );
        return { source: text, translations };
      })
    );

    // Persist each successful (source, locale) cell so the UI can review it.
    // One TranslationJob + TranslationOutput + v1 history row + TM entry per
    // cell, all in one $transaction. Failed cells are skipped — those don't
    // get an outputId. If persistence as a whole fails, we DON'T fail the
    // request — translations succeeded, the operator just can't review them.
    const authUser = req.authUser!;
    try {
      await prisma.$transaction(async (tx) => {
        for (const row of results) {
          for (const locale of payload.locales) {
            const cell = row.translations[locale];
            if (!cell || cell.status !== "ok") continue;
            const job = await tx.translationJob.create({
              data: {
                sourceText: row.source,
                sourceLanguage: "auto",
                targetLocale: locale,
                textType: "batch_translate",
                persona: "batch",
                tone: "batch",
                outputCount: 1,
                status: "completed",
                createdByUserId: authUser.id,
              },
            });
            const output = await tx.translationOutput.create({
              data: {
                jobId: job.id,
                outputText: cell.text,
                version: 1,
                score: cell.qualityGate?.score,
                approved: false,
              },
            });
            await tx.translationOutputVersion.create({
              data: {
                translationOutputId: output.id,
                versionNumber: 1,
                eventType: "initial_generation",
                outputText: cell.text,
                approved: false,
                score: cell.qualityGate?.score,
                createdByUserId: authUser.id,
              },
            });
            await tx.translationMemoryEntry.create({
              data: {
                sourceText: row.source,
                targetText: cell.text,
                sourceLanguage: "auto",
                targetLocale: locale,
                textType: "batch_translate",
                createdByUserId: authUser.id,
              },
            });
            cell.outputId = output.id;
            cell.jobId = job.id;
          }
        }
      });
    } catch (persistErr) {
      // Log loudly but don't fail the request; the translations themselves
      // succeeded and are still in the response.
      console.error("[batch] persist pass failed (results returned without outputIds):", persistErr);
    }

    res.json({ results });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("POST /api/batch failed:", error);
    const mapped = mapTranslateError(error, "Batch translation failed.");
    res.status(mapped.status).json(mapped.body);
  }
}));

async function translate(text: string, systemPrompt: string): Promise<string> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for translation.");
  }
  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: text },
    ],
    temperature: 0.2,
    max_tokens: 400,
  });

  return extractTranslation(response);
}

async function shorten(text: string, locale: string, maxChars: number): Promise<string> {
  const language = LOCALE_LANGUAGE[locale] || locale;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      {
        role: "system",
        content: `You are a marketing copywriter. Shorten the following ${language} marketing text to strictly ${maxChars} characters or fewer. Preserve the core message and brand names. Output only the shortened text, nothing else.`,
      },
      {
        role: "user",
        content: `Text (${text.length} chars, must be <=${maxChars}): ${text}`,
      },
    ],
    temperature: 0.3,
    max_tokens: 200,
  });

  const result = extractTranslation(response);
  return result.length <= maxChars ? result : result.slice(0, maxChars).trimEnd();
}

router.post("/alternatives", requireAuth, asyncHandler(async (req, res) => {
  const schema = z.object({
    text: z.string().min(1),
    locale: z.enum(LOCALES),
    maxChars: z.number().optional(),
    formatContext: z.string().optional(),
    count: z.number().min(1).max(5).default(3),
  });

  try {
    const payload = schema.parse(req.body);
    const hints = [
      "Rephrase this completely using entirely different words and sentence structure.",
      "Write a shorter, punchier version with a different opening word.",
      "Rewrite using a more direct, active voice with fresh vocabulary.",
      "Create a more formal, professional variant that reads differently.",
      "Write a more conversational version with a completely different approach.",
    ];
    const temperatures = [0.4, 0.6, 0.7, 0.8, 0.9];

    type AltResult =
      | { status: "ok"; text: string }
      | { status: "failed"; error: string };

    const raw: AltResult[] = await Promise.all(
      Array.from({ length: payload.count }, (_, i) => {
        const language = LOCALE_LANGUAGE[payload.locale] || payload.locale;
        const limitInstruction = payload.maxChars
          ? ` The result MUST be ${payload.maxChars} characters or fewer.`
          : "";
        const formatInstruction = payload.formatContext ? ` This is for: ${payload.formatContext}.` : "";

        return openai.chat.completions.create({
          model: "gpt-4o",
          messages: [
            {
              role: "system",
              content: `You are a marketing translator for a regulated financial trading platform (MEXEM). Translate the following text to ${language} (${payload.locale}). ${hints[i % hints.length]} Preserve brand names and asterisks (*). Output only the translated text, nothing else.${formatInstruction}${limitInstruction}`,
            },
            { role: "user", content: payload.text },
          ],
          temperature: temperatures[i % temperatures.length],
          max_tokens: 400,
        }).then(r => extractTranslation(r))
          .then(async (t) => {
            if (payload.maxChars && t.length > payload.maxChars) {
              return shorten(t, payload.locale, payload.maxChars);
            }
            return t;
          })
          .then<AltResult>((text) => ({ status: "ok", text }))
          .catch<AltResult>((err: any) => {
            // Only empty-content counts as per-variant failure; anything else
            // bubbles so infra/provider-network failures aren't masked.
            if (err instanceof EmptyTranslationError) {
              console.error("[batch/alternatives] variant empty-content:", err);
              return { status: "failed", error: "Model returned empty response." };
            }
            throw err;
          });
      })
    );

    const successes = raw.filter((r): r is { status: "ok"; text: string } => r.status === "ok").map(r => r.text);
    const failed = raw.length - successes.length;

    if (successes.length === 0) {
      return res.status(502).json({
        error: "Failed to generate alternatives.",
        failed,
      });
    }

    const alternatives = [...new Set(successes)];
    res.json({ alternatives, failed });
  } catch (error: any) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error("POST /api/batch/alternatives failed:", error);
    const mapped = mapTranslateError(error, "Failed to generate alternatives.");
    res.status(mapped.status).json(mapped.body);
  }
}));

export default router;
