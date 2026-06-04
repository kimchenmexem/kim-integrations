import { Router } from "express";
import { z } from "zod";
import { prisma } from "../db";
import { GlossaryTermCreate } from "@mexem/shared";
import { requireAuth, requireRole } from "../middleware/auth";
import { writeAudit, summariseGlossaryTerm } from "../services/audit";

const router = Router();

// Glossary writes affect every future translation — gate on REVIEWER+.
const requireReviewer = requireRole("REVIEWER", "MANAGER", "ADMIN");

const glossarySchema = z.object({
  sourceTerm: z.string().min(1),
  targetTerm: z.string().min(1),
  localeCode: z.string().optional(),
  required: z.boolean().default(false),
  forbidden: z.boolean().default(false),
  notes: z.string().optional()
});

// Glossary is a shared terminology corpus — reads are unrestricted among
// authenticated users, but the endpoint is no longer public.
router.get("/", requireAuth, async (_req, res) => {
  const glossary = await prisma.glossaryTerm.findMany({ orderBy: [{ sourceTerm: "asc" }] });
  res.json({ glossary });
});

router.post("/", requireReviewer, async (req, res) => {
  try {
    const payload = glossarySchema.parse(req.body);
    const term = await prisma.glossaryTerm.create({
      data: { ...(payload as GlossaryTermCreate), createdByUserId: req.authUser!.id },
    });
    await writeAudit(req, {
      action: "glossary.create",
      entityType: "GlossaryTerm",
      entityId: term.id,
      after: summariseGlossaryTerm(term),
    });
    res.status(201).json(term);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Unable to save glossary term." });
  }
});

router.put("/:id", requireReviewer, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid glossary term id." });
  }

  try {
    const payload = glossarySchema.partial().parse(req.body);
    const before = await prisma.glossaryTerm.findUnique({ where: { id } });
    if (!before) {
      return res.status(404).json({ error: "Glossary term not found." });
    }
    const term = await prisma.glossaryTerm.update({ where: { id }, data: payload });
    await writeAudit(req, {
      action: "glossary.update",
      entityType: "GlossaryTerm",
      entityId: term.id,
      before: summariseGlossaryTerm(before),
      after: summariseGlossaryTerm(term),
    });
    res.json(term);
  } catch (error) {
    if (error instanceof z.ZodError) {
      return res.status(400).json({ error: error.errors });
    }
    console.error(error);
    res.status(500).json({ error: "Unable to update glossary term." });
  }
});

router.delete("/:id", requireReviewer, async (req, res) => {
  const id = Number(req.params.id);
  if (Number.isNaN(id)) {
    return res.status(400).json({ error: "Invalid glossary term id." });
  }

  const before = await prisma.glossaryTerm.findUnique({ where: { id } });
  if (!before) {
    return res.status(404).json({ error: "Glossary term not found." });
  }
  await prisma.glossaryTerm.delete({ where: { id } });
  await writeAudit(req, {
    action: "glossary.delete",
    entityType: "GlossaryTerm",
    entityId: id,
    before: summariseGlossaryTerm(before),
  });
  res.status(204).end();
});

export default router;
