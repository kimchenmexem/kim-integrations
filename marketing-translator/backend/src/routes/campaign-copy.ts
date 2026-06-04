/**
 * POST /api/campaign-copy
 *
 * Service-to-service endpoint that produces a localized ad copy package
 * for a campaign brief. Used by ai-campaign-banner so it never has to
 * generate marketing copy itself.
 *
 * Auth: requireAuthOrApiKey (static CAMPAIGN_COPY_API_KEY when set; else
 * Clerk). No DB persistence in v1.
 */

import { Router } from "express";
import { z } from "zod";
import {
  generateCampaignCopy,
  generateCampaignCopyBatch,
  generateCampaignCopyByMessage,
  UnsupportedLocaleError,
} from "../services/campaignCopy";
import { requireAuthOrApiKey } from "../middleware/serviceAuth";

const router = Router();

const SUPPORTED_LOCALES = [
  "it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES", "en-GB",
] as const;

const briefSchema = z.object({
  marketingMessage: z.string().min(1).max(2000),
  campaignGoal: z.enum(["awareness", "consideration", "conversion", "retention"]),
  targetAudience: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
});

const toneSchema = z.union([
  z.string().min(1),
  z.array(z.string().min(1)).min(1),
]);

const requestSchema = z.object({
  brief: briefSchema,
  targetLocale: z.enum(SUPPORTED_LOCALES),
  tone: toneSchema,
  complianceNotes: z.string().max(2000).optional(),
  riskWarningRequired: z.boolean().optional(),
  conceptHint: z
    .object({
      conceptId: z.string().min(1).optional(),
      name: z.string().min(1).max(120).optional(),
      strategicIdea: z.string().min(1).max(500).optional(),
    })
    .optional(),
});

// Batch: a single brief + locale + tone, with up to 8 concepts. One OpenAI
// round-trip serves them all with explicit cross-concept variation rules.
const batchConceptSchema = z.object({
  conceptId: z.string().min(1).max(80),
  name: z.string().min(1).max(120).optional(),
  strategicIdea: z.string().min(1).max(500).optional(),
  targetEmotion: z.string().min(1).max(120).optional(),
  tone: toneSchema.optional(),
  composition: z.string().min(1).max(120).optional(),
  moodKeywords: z.array(z.string().min(1).max(60)).max(12).optional(),
});

const batchRequestSchema = z.object({
  brief: briefSchema,
  targetLocale: z.enum(SUPPORTED_LOCALES),
  tone: toneSchema,
  complianceNotes: z.string().max(2000).optional(),
  riskWarningRequired: z.boolean().optional(),
  concepts: z.array(batchConceptSchema).min(1).max(8),
});

router.post("/", requireAuthOrApiKey, async (req, res) => {
  const parsed = requestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors });
  }
  try {
    const result = await generateCampaignCopy(parsed.data);
    return res.json(result);
  } catch (err) {
    if (err instanceof UnsupportedLocaleError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("POST /api/campaign-copy failed:", err);
    return res.status(500).json({ error: "Campaign copy generation failed." });
  }
});

// POST /api/campaign-copy/by-message
//
// "textType-driven" alternative to /batch. Same response shape, but every
// banner field (headline / sub / body / cta / disclaimer / eyebrow / kicker)
// is generated in its own OpenAI call with a platform-conventional textType
// prompt + length budget. Use when per-field length awareness matters more
// than cross-field coherence. 5-7x the LLM cost of /batch.
const byMessageRequestSchema = z.object({
  brief: briefSchema,
  targetLocale: z.enum(SUPPORTED_LOCALES),
  persona: z.string().min(1).max(80),
  tone: toneSchema,
  complianceNotes: z.string().max(2000).optional(),
  riskWarningRequired: z.boolean().optional(),
  conceptCount: z.number().int().min(1).max(5).optional(),
});

router.post("/by-message", requireAuthOrApiKey, async (req, res) => {
  const parsed = byMessageRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors });
  }
  try {
    const result = await generateCampaignCopyByMessage(parsed.data);
    return res.json(result);
  } catch (err) {
    if (err instanceof UnsupportedLocaleError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("POST /api/campaign-copy/by-message failed:", err);
    return res.status(500).json({ error: "Campaign copy by-message generation failed." });
  }
});

router.post("/batch", requireAuthOrApiKey, async (req, res) => {
  const parsed = batchRequestSchema.safeParse(req.body);
  if (!parsed.success) {
    return res.status(400).json({ error: parsed.error.errors });
  }
  // Reject duplicate conceptIds — would produce ambiguous mapping back.
  const ids = parsed.data.concepts.map((c) => c.conceptId);
  if (new Set(ids).size !== ids.length) {
    return res.status(400).json({ error: "concepts[].conceptId must be unique." });
  }
  try {
    const result = await generateCampaignCopyBatch(parsed.data);
    return res.json(result);
  } catch (err) {
    if (err instanceof UnsupportedLocaleError) {
      return res.status(400).json({ error: err.message });
    }
    console.error("POST /api/campaign-copy/batch failed:", err);
    return res.status(500).json({ error: "Campaign copy batch generation failed." });
  }
});

export default router;
