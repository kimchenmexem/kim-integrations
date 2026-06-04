import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { validateCompliance } from "../services/compliance";
import { translateToLocale } from "../services/ai";
import { LocaleCode } from "@mexem/shared";
import { requireAuth } from "../middleware/auth";

const router = Router();

const demoRequestSchema = z.object({
  text: z.string().min(1),
  locale: z.enum(["it-IT", "fr-FR", "nl-NL", "nl-BE", "fr-BE", "es-ES", "en-GB"])
});

router.post("/check", requireAuth, async (req, res) => {
  try {
    const payload = demoRequestSchema.parse(req.body);

    const result = await validateCompliance(payload.text, payload.locale as LocaleCode);

    // Always translate the original text — compliance status is shown separately.
    // The aggressive fallback rewrite is not used for the demo output.
    const translatedFinalText = await translateToLocale(result.originalText, payload.locale);
    const rewriteApplied = false;
    const translatedOriginalText = result.originalText;

    // Log the demo run — captures creator identity for later cohort analysis
    // and so USER-level reads see only their own runs.
    await prisma.demoRun.create({
      data: {
        inputText: payload.text,
        locale: payload.locale,
        status: result.status,
        riskLevel: result.riskLevel,
        finalAction: result.finalAction,
        finalConfidence: result.finalConfidence,
        semanticResult: JSON.stringify(result.semanticResult),
        independentResult: JSON.stringify(result.independentResult),
        originalText: result.originalText,
        finalText: translatedFinalText,
        issues: JSON.stringify(result.issues),
        rewriteApplied,
        createdByUserId: req.authUser!.id,
      }
    });

    res.json({
      finalText: translatedFinalText,
      status: result.status,
      riskLevel: result.riskLevel,
      finalAction: result.finalAction,
      issues: result.issues,
      rewriteApplied,
      semanticResult: result.semanticResult,
      independentResult: result.independentResult,
      finalDecision: result.status,
      confidence: result.finalConfidence,
      beforeRewrite: translatedOriginalText,
      afterRewrite: translatedFinalText,
      isDemo: true,
      disclaimer: "Demo – not production validated"
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Unable to process demo request." });
  }
});

export default router;