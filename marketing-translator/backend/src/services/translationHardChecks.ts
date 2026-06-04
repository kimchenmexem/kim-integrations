import { prisma } from "../db";

export interface HardCheckIssue {
  code: "placeholder" | "html" | "number" | "empty" | "truncation" | "glossary_forbidden" | "glossary_required";
  severity: "minor" | "major" | "critical";
  message: string;
}

export interface HardCheckResult {
  passed: boolean;
  issues: HardCheckIssue[];
}

// ─── Placeholder preservation ──────────────────────────────────────
// Matches {{var}}, {var}, %s, %d, %1$s, ${var}, [[var]]
const PLACEHOLDER_RE = /\{\{[\w.]+\}\}|\{[\w.]+\}|%[0-9]*\$?[sdfu]|\$\{[\w.]+\}|\[\[[\w.]+\]\]/g;

function checkPlaceholders(source: string, translation: string): HardCheckIssue[] {
  const srcPlaceholders: string[] = Array.from(source.match(PLACEHOLDER_RE) ?? []).sort();
  const tgtPlaceholders: string[] = Array.from(translation.match(PLACEHOLDER_RE) ?? []).sort();

  if (srcPlaceholders.length === 0) return [];

  const issues: HardCheckIssue[] = [];
  const missing = srcPlaceholders.filter(p => !tgtPlaceholders.includes(p));
  const extra = tgtPlaceholders.filter(p => !srcPlaceholders.includes(p));

  if (missing.length > 0) {
    issues.push({
      code: "placeholder",
      severity: "critical",
      message: `Missing placeholders in translation: ${missing.join(", ")}`,
    });
  }
  if (extra.length > 0) {
    issues.push({
      code: "placeholder",
      severity: "major",
      message: `Unexpected placeholders in translation: ${extra.join(", ")}`,
    });
  }
  return issues;
}

// ─── HTML / tag preservation ───────────────────────────────────────
const HTML_TAG_RE = /<\/?[a-zA-Z][^>]*>/g;

function checkHtmlTags(source: string, translation: string): HardCheckIssue[] {
  const srcTags: string[] = Array.from(source.match(HTML_TAG_RE) ?? []).sort();
  const tgtTags: string[] = Array.from(translation.match(HTML_TAG_RE) ?? []).sort();

  if (srcTags.length === 0) return [];

  const issues: HardCheckIssue[] = [];
  const missing = srcTags.filter(t => !tgtTags.includes(t));
  const extra = tgtTags.filter(t => !srcTags.includes(t));

  if (missing.length > 0) {
    issues.push({
      code: "html",
      severity: "critical",
      message: `Missing HTML tags: ${missing.join(", ")}`,
    });
  }
  if (extra.length > 0) {
    issues.push({
      code: "html",
      severity: "major",
      message: `Unexpected HTML tags: ${extra.join(", ")}`,
    });
  }
  return issues;
}

// ─── Number / date / currency preservation ─────────────────────────
// Extracts standalone numbers, percentages, currency values, dates
const NUMBER_RE = /(?:\d{1,3}(?:[.,]\d{3})*(?:[.,]\d+)?%?)|(?:[€$£¥]\s*\d[\d.,]*)|(?:\d[\d.,]*\s*[€$£¥])|(?:\d{1,2}[/\-.]\d{1,2}[/\-.]\d{2,4})/g;

function extractNumbers(text: string): string[] {
  return (text.match(NUMBER_RE) ?? []).map(n => n.replace(/\s/g, ""));
}

function checkNumbers(source: string, translation: string): HardCheckIssue[] {
  const srcNums = extractNumbers(source);
  if (srcNums.length === 0) return [];

  const tgtNums = extractNumbers(translation);
  const missing = srcNums.filter(n => !tgtNums.some(t => normalizeNum(t) === normalizeNum(n)));

  if (missing.length > 0) {
    return [{
      code: "number",
      severity: "major",
      message: `Numbers/values potentially altered or missing: ${missing.join(", ")}`,
    }];
  }
  return [];
}

function normalizeNum(s: string): string {
  // Strip currency symbols and whitespace for comparison, keep digits and separators
  return s.replace(/[€$£¥\s]/g, "");
}

// ─── Empty output ──────────────────────────────────────────────────
function checkEmpty(translation: string): HardCheckIssue[] {
  if (translation.trim().length === 0) {
    return [{
      code: "empty",
      severity: "critical",
      message: "Translation output is empty.",
    }];
  }
  return [];
}

// ─── Suspicious truncation ─────────────────────────────────────────
function checkTruncation(source: string, translation: string): HardCheckIssue[] {
  const srcLen = source.length;
  const tgtLen = translation.length;

  // If translation is less than 30% of source length, likely truncated
  if (srcLen > 20 && tgtLen < srcLen * 0.3) {
    return [{
      code: "truncation",
      severity: "major",
      message: `Translation appears truncated (${tgtLen} chars vs ${srcLen} source chars).`,
    }];
  }
  return [];
}

// ─── Glossary violations ───────────────────────────────────────────
async function checkGlossary(
  sourceText: string,
  translation: string,
  locale: string
): Promise<HardCheckIssue[]> {
  const terms = await prisma.glossaryTerm.findMany({
    where: {
      OR: [
        { localeCode: locale },
        { localeCode: null },
      ],
    },
  });

  const issues: HardCheckIssue[] = [];
  const lowerSource = sourceText.toLowerCase();
  const lowerTranslation = translation.toLowerCase();

  for (const term of terms) {
    if (term.forbidden && lowerTranslation.includes(term.targetTerm.toLowerCase())) {
      issues.push({
        code: "glossary_forbidden",
        severity: "major",
        message: `Forbidden glossary term found: "${term.targetTerm}"`,
      });
    }
    // Only enforce required terms when the source text actually references them —
    // prevents flagging translations for terms that were never in scope.
    if (
      term.required &&
      lowerSource.includes(term.sourceTerm.toLowerCase()) &&
      !lowerTranslation.includes(term.targetTerm.toLowerCase())
    ) {
      issues.push({
        code: "glossary_required",
        severity: "major",
        message: `Required glossary term missing: "${term.targetTerm}"`,
      });
    }
  }

  return issues;
}

// ─── Public API ────────────────────────────────────────────────────

export async function runHardChecks(
  sourceText: string,
  translation: string,
  locale: string
): Promise<HardCheckResult> {
  const issues: HardCheckIssue[] = [
    ...checkEmpty(translation),
    ...checkPlaceholders(sourceText, translation),
    ...checkHtmlTags(sourceText, translation),
    ...checkNumbers(sourceText, translation),
    ...checkTruncation(sourceText, translation),
    ...(await checkGlossary(sourceText, translation, locale)),
  ];

  const hasCritical = issues.some(i => i.severity === "critical");
  return { passed: !hasCritical, issues };
}
