import { prisma } from "../db";

export function getDefaultGlossary() {
  return [
    {
      sourceTerm: "MEXEM",
      targetTerm: "MEXEM",
      localeCode: null,
      required: true,
      forbidden: false,
      notes: "Brand name should remain unchanged."
    },
    {
      sourceTerm: "self-directed trading",
      targetTerm: "self-directed trading",
      localeCode: null,
      required: false,
      forbidden: false,
      notes: "Preserve meaning in local wording."
    }
  ];
}

/**
 * Retrieve glossary terms relevant to a locale.
 * Returns terms where localeCode matches OR localeCode is null (global terms).
 */
export async function getGlossaryForLocale(locale: string): Promise<
  Array<{ sourceTerm: string; targetTerm: string; required: boolean; notes: string | null }>
> {
  return prisma.glossaryTerm.findMany({
    where: {
      OR: [{ localeCode: locale }, { localeCode: null }],
    },
    select: { sourceTerm: true, targetTerm: true, required: true, notes: true },
    orderBy: { sourceTerm: "asc" },
  });
}

/**
 * Build a glossary prompt block for injection into translation prompts.
 * Only includes terms whose sourceTerm appears in the source text (case-insensitive),
 * plus all required/brand terms regardless.
 */
export async function buildGlossaryPrompt(sourceText: string, locale: string): Promise<string> {
  const allTerms = await getGlossaryForLocale(locale);
  if (allTerms.length === 0) return "";

  const lower = sourceText.toLowerCase();

  // Filter: include if sourceTerm appears in text OR term is required (brand names)
  const relevant = allTerms.filter(
    (t) => t.required || lower.includes(t.sourceTerm.toLowerCase())
  );

  if (relevant.length === 0) return "";

  // Deduplicate by sourceTerm (prefer locale-specific over global)
  const seen = new Map<string, typeof relevant[0]>();
  for (const t of relevant) {
    const key = t.sourceTerm.toLowerCase();
    if (!seen.has(key)) seen.set(key, t);
  }

  const lines = Array.from(seen.values()).map((t) => {
    const arrow = `"${t.sourceTerm}" → "${t.targetTerm}"`;
    return t.required ? `${arrow} (REQUIRED — do not change)` : arrow;
  });

  return `
GLOSSARY — use these exact translations for consistency:
${lines.join("\n")}
When a glossary term appears in the source text, you MUST use the specified translation. Do not invent alternatives for glossary terms.`;
}
