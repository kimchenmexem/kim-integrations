import { prisma } from "../db";

interface FewShotPositive {
  sourceText: string;
  outputText: string;
  reviewerNote: string | null;
}

interface FewShotNegative {
  sourceText: string;
  outputText: string;
  correctedTranslation: string | null;
  issueCodes: string[];
  reviewerNote: string | null;
}

interface FewShotBlock {
  positive: FewShotPositive[];
  negative: FewShotNegative[];
}

/**
 * Retrieves human-reviewed translations from TranslationReview,
 * scoped by locale + textType, with optional source language filter.
 *
 * Returns up to 3 approved and 2 rejected examples, preferring
 * those with corrected translations and structured issue codes.
 */
export async function getFewShotExamples(
  targetLocale: string,
  textType: string,
  sourceLanguage?: string
): Promise<FewShotBlock> {
  // Build job filter — always scope by locale + textType,
  // optionally narrow by source language
  const jobFilter: Record<string, string> = { targetLocale, textType };
  if (sourceLanguage) jobFilter.sourceLanguage = sourceLanguage;

  // Approved examples: prefer those with a reviewer note
  const approved = await prisma.translationReview.findMany({
    where: {
      decision: "approved",
      output: { job: jobFilter },
    },
    include: {
      output: {
        include: { job: { select: { sourceText: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 3,
  });

  // Rejected examples: prefer those with a corrected translation
  const rejected = await prisma.translationReview.findMany({
    where: {
      decision: "rejected",
      output: { job: jobFilter },
      // Only include rejections that have actionable feedback
      OR: [
        { correctedTranslation: { not: null } },
        { note: { not: null } },
      ],
    },
    include: {
      output: {
        include: { job: { select: { sourceText: true } } },
      },
    },
    orderBy: { createdAt: "desc" },
    take: 2,
  });

  return {
    positive: approved.map((r) => ({
      sourceText: r.output.job.sourceText,
      outputText: r.output.outputText,
      reviewerNote: r.note,
    })),
    negative: rejected.map((r) => ({
      sourceText: r.output.job.sourceText,
      outputText: r.output.outputText,
      correctedTranslation: r.correctedTranslation,
      issueCodes: parseIssueCodes(r.issueCodes),
      reviewerNote: r.note,
    })),
  };
}

/**
 * Formats few-shot examples into a prompt block.
 *
 * - Positive examples are shown as "follow this style"
 * - Negative examples show the issues and preferred correction,
 *   with explicit instructions NOT to imitate the bad wording
 * - All reviewer notes are sanitized and clearly delimited
 */
export function formatFewShotPrompt(examples: FewShotBlock): string {
  if (examples.positive.length === 0 && examples.negative.length === 0) {
    return "";
  }

  const lines: string[] = [];

  if (examples.positive.length > 0) {
    lines.push("APPROVED EXAMPLES — follow this style and quality level:");
    for (const ex of examples.positive) {
      lines.push(`  Source: "${truncate(ex.sourceText, 200)}"`);
      lines.push(`  Approved translation: "${truncate(ex.outputText, 200)}"`);
      if (ex.reviewerNote) {
        lines.push(`  [Reviewer feedback: ${sanitize(ex.reviewerNote)}]`);
      }
      lines.push("");
    }
  }

  if (examples.negative.length > 0) {
    lines.push(
      "REJECTED EXAMPLES — analyze why these failed. Do NOT imitate their wording or phrasing:"
    );
    for (const ex of examples.negative) {
      lines.push(`  Source: "${truncate(ex.sourceText, 200)}"`);
      lines.push(`  Rejected translation: "${truncate(ex.outputText, 200)}"`);
      if (ex.issueCodes.length > 0) {
        lines.push(`  Issues identified: ${ex.issueCodes.join(", ")}`);
      }
      if (ex.reviewerNote) {
        lines.push(`  [Reviewer feedback: ${sanitize(ex.reviewerNote)}]`);
      }
      if (ex.correctedTranslation) {
        lines.push(
          `  Preferred correction: "${truncate(ex.correctedTranslation, 200)}"`
        );
      }
      lines.push("");
    }
  }

  return "\n" + lines.join("\n");
}

/** Parse JSON issue codes array, returning empty array on failure */
function parseIssueCodes(raw: string | null): string[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

/** Truncate text to a max length */
function truncate(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

/**
 * Sanitize reviewer notes before injecting into the prompt.
 * Strips characters that could break prompt structure and
 * truncates to prevent bloating the context.
 */
function sanitize(text: string): string {
  return text
    .replace(/[\r\n]+/g, " ")    // collapse newlines
    .replace(/["""]/g, "'")       // normalize quotes
    .replace(/\s{2,}/g, " ")     // collapse whitespace
    .trim()
    .slice(0, 300);
}
