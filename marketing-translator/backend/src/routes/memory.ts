import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { TranslationMemoryEntry } from "@mexem/shared";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit } from "../services/audit";

const router = Router();

const memorySchema = z.object({
  sourceText: z.string().min(1),
  targetText: z.string().min(1),
  sourceLanguage: z.string().min(2),
  targetLocale: z.string().min(2),
  textType: z.string().min(1)
});

// Memory entries are a shared translation corpus — every authenticated user
// benefits from the full set, so reads are not owner-scoped. But the endpoint
// is no longer public: it now requires auth like every other internal read.
router.get("/", requireAuth, async (_req, res) => {
  const entries = await prisma.translationMemoryEntry.findMany({ orderBy: [{ createdAt: "desc" }], take: 50 });
  res.json({ entries });
});

router.post("/", requireRole("REVIEWER", "MANAGER", "ADMIN"), async (req, res) => {
  try {
    const payload = memorySchema.parse(req.body);
    const entry = await prisma.translationMemoryEntry.create({
      data: { ...(payload as TranslationMemoryEntry), createdByUserId: req.authUser!.id },
    });
    // Data minimisation: store locale + text type + text lengths instead of
    // full source/target strings. Full text lives in the TranslationMemoryEntry
    // table itself; the audit trail records actor identity and routing metadata.
    await writeAudit(req, {
      action: "memory.create",
      entityType: "TranslationMemoryEntry",
      entityId: entry.id,
      after: {
        id: entry.id,
        sourceLanguage: entry.sourceLanguage,
        targetLocale: entry.targetLocale,
        textType: entry.textType,
        sourceTextLength: entry.sourceText.length,
        targetTextLength: entry.targetText.length,
      },
    });
    res.status(201).json(entry);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Unable to save memory entry." });
  }
});

export default router;
