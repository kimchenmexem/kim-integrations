/**
 * /api/campaign — campaign-brief → multi-platform copy generation.
 *
 * Auth: any signed-in USER+.
 * Rate-limit: shared translateLimiter (OpenAI-burning route).
 */

import { Router } from "express";
import { z } from "zod";
import { requireAuth } from "../middleware/auth";
import { asyncHandler } from "../middleware/asyncHandler";
import { mapTranslateError } from "../services/translateErrors";
import {
  generateCampaign,
  PLATFORM_CATALOGUE,
} from "../services/campaignGenerator";

const router = Router();

const SUPPORTED_LOCALES = [
  "it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES", "en-GB",
] as const;

const generateSchema = z.object({
  brief: z.string().min(10).max(5000),
  locale: z.enum(SUPPORTED_LOCALES),
  persona: z.string().max(200).optional(),
  tone: z.string().max(200).optional(),
  platforms: z.array(z.string()).optional(),
});

// GET /catalogue — list the platforms + assets we generate for, so the
// frontend can render the platform-picker without hard-coding the list.
router.get("/catalogue", requireAuth, (_req, res) => {
  res.json({ platforms: PLATFORM_CATALOGUE });
});

router.post("/generate", requireAuth, asyncHandler(async (req, res) => {
  try {
    const payload = generateSchema.parse(req.body);
    const result = await generateCampaign(payload);
    res.json(result);
  } catch (err: any) {
    if (err instanceof z.ZodError) return res.status(400).json({ error: err.errors });
    console.error("POST /api/campaign/generate failed:", err);
    const mapped = mapTranslateError(err, "Campaign generation failed.");
    res.status(mapped.status).json(mapped.body);
  }
}));

export default router;
