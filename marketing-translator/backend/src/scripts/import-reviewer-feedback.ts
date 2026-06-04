#!/usr/bin/env ts-node-dev
/**
 * Import reviewer feedback CSVs into the TranslationReview table.
 *
 * Reads:
 *   marketing-translator/csv-feedback/{locale}.csv
 *
 * For each row with a non-empty `correct text` (or `currect text`) column:
 *   1. Create a TranslationJob (synthetic — represents the LLM run that
 *      produced the output)
 *   2. Create a TranslationOutput holding the LLM's draft text
 *   3. Create a TranslationReview marked "rejected" with the corrected
 *      translation + a derived issueCodes set
 *
 * The few-shot helper in fewShotExamples.ts pulls from TranslationReview,
 * filtered by locale + textType. We insert under BOTH "campaign_copy" and
 * "quick_translate" so the examples reach the /api/translate paths the
 * brand actually uses.
 *
 * Modes:
 *   npm --workspace backend run import:reviewer-feedback -- --dry-run
 *     Print what would be inserted; touch nothing.
 *   npm --workspace backend run import:reviewer-feedback -- --apply
 *     Actually insert into the DB.
 *
 * Mojibake repair:
 *   The source CSVs were saved as UTF-8 from an upstream tool that mis-read
 *   them as Latin-1 (or stripped the middle continuation byte of certain
 *   3-byte UTF-8 sequences like the Euro sign). We pre-clean the known
 *   stripped patterns, then run a Latin-1 round-trip for the rest.
 */
import { promises as fs } from "node:fs";
import path from "node:path";
import { prisma } from "../db";

const CSV_DIR = path.resolve(__dirname, "../../../csv-feedback");
const LOCALES = ["it-IT", "fr-FR", "fr-BE", "nl-NL", "nl-BE", "es-ES"] as const;
type Locale = (typeof LOCALES)[number];

const TARGET_TEXT_TYPES = ["campaign_copy", "quick_translate"];

const REVIEWER_TAG = "csv-import-2026-05-26";

interface ParsedRow {
  source: string;
  output: string;
  correct: string;
  comment: string;
}

// ── CSV parser ──────────────────────────────────────────────────────────────
function parseCsv(text: string): ParsedRow[] {
  const rows: string[][] = [];
  let field = "";
  let row: string[] = [];
  let inQuotes = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQuotes) {
      if (c === '"' && text[i + 1] === '"') {
        field += '"';
        i++;
      } else if (c === '"') {
        inQuotes = false;
      } else {
        field += c;
      }
    } else {
      if (c === '"') {
        inQuotes = true;
      } else if (c === ",") {
        row.push(field);
        field = "";
      } else if (c === "\n" || c === "\r") {
        if (c === "\r" && text[i + 1] === "\n") i++;
        row.push(field);
        if (row.length > 1 || row[0] !== "") rows.push(row);
        row = [];
        field = "";
      } else {
        field += c;
      }
    }
  }
  if (field !== "" || row.length > 0) {
    row.push(field);
    rows.push(row);
  }
  return rows
    .slice(1)
    .filter((r) => r.some((c) => c.trim() !== ""))
    .map((r) => ({
      source: (r[0] ?? "").trim(),
      output: (r[1] ?? "").trim(),
      correct: (r[2] ?? "").trim(),
      comment: (r[3] ?? "").trim(),
    }));
}

// ── Mojibake repair ─────────────────────────────────────────────────────────
// Two-stage. Stage 1 fixes patterns where an upstream tool stripped the
// middle continuation byte of a 3-byte UTF-8 char (Euro sign is the only
// one we've seen in this corpus). Stage 2 is the standard Latin-1 round-
// trip for 2-byte sequences whose bytes survived intact.
const REPLACEMENT_CHAR = String.fromCharCode(0xfffd);
const HIGH_CHAR_RE = new RegExp("[" + String.fromCharCode(0x0080) + "-" + String.fromCharCode(0x00ff) + "]");

const STRIPPED_MOJIBAKE_FIXES: Array<[RegExp, string]> = [
  // â¬ (2 chars: E2 + AC) is the Euro sign with the middle 82 byte missing.
  // Recovering the original byte sequence isn't possible from these 2 chars
  // alone, so we substitute the intended Unicode directly.
  [/â¬/g, "€"],
];

// Repair each contiguous run of Latin-1-supplement chars independently —
// runs that decode cleanly as UTF-8 get replaced, runs that fail (like the
// stripped Euro `â¬`) are left alone for the STRIPPED_MOJIBAKE_FIXES pass.
// This avoids the earlier whole-string-or-nothing failure mode where one
// bad sequence in a long string aborted repair for the whole string.
const RUN_RE = new RegExp("[" + String.fromCharCode(0x0080) + "-" + String.fromCharCode(0x00ff) + "]+", "g");

function repairMojibake(s: string): string {
  if (!s) return s;
  try {
    let out = s.replace(RUN_RE, (run) => {
      const decoded = Buffer.from(run, "latin1").toString("utf8");
      // If decoding produces FFFD, this run isn't a valid UTF-8 sequence
      // when read as Latin-1 bytes — leave the original chars in place
      // so the stripped-mojibake table below can take a shot at it.
      return decoded.includes(REPLACEMENT_CHAR) ? run : decoded;
    });
    for (const [pat, rep] of STRIPPED_MOJIBAKE_FIXES) out = out.replace(pat, rep);
    return out;
  } catch {
    return s;
  }
}

// Curly-quote remnants: when smart-quote bytes got stripped to a bare `â`
// (U+00E2), coerce to a straight `"` so the few-shot prompt stays readable.
// Runs AFTER Latin-1 round-trip — if curly quotes survived intact, the
// round-trip restored them and there's no bare `â` left.
function repairCurlyQuoteRemnants(s: string): string {
  return s.replace(/â/g, '"');
}

function clean(s: string): string {
  return repairCurlyQuoteRemnants(repairMojibake(s));
}

// Reviewer convention: corrected text written as "X / Y" or "X /or/ Y"
// means "either form is acceptable". Importing as-is would teach the LLM
// to output the slash-joined string. Take the first alternative.
function pickPrimaryAlternative(s: string): string {
  if (!s) return s;
  const split = s.split(/\s+\/(?:or)?\/?\s+/);
  return split[0].trim();
}

// ── issueCodes derivation ───────────────────────────────────────────────────
function deriveIssueCodes(comment: string, output: string, correct: string): string[] {
  const codes: string[] = [];
  const c = (comment + " " + output + " " + correct).toLowerCase();
  const push = (code: string) => {
    if (!codes.includes(code)) codes.push(code);
  };
  if (/\b(?:ETF|ETP|CFD|REIT|ADR)s\b/.test(output) || /etfs? not etf|etps? not etp/i.test(comment))
    push("acronym_plural");
  if (/\bue\b/i.test(comment) || /\bue\b/.test(output)) push("ue_unnatural");
  if (/tariff/i.test(c)) push("term_tariffa");
  if (/basso costo|low cost|economic|cheap|conveniente|barato/i.test(c)) push("register_low_cost");
  if (/n[eé]gociation|n[eé]gocier|trading/i.test(comment)) push("term_negociation");
  if (/europ[eé]/i.test(comment) || /europ[eé]/i.test(correct)) push("ue_unnatural");
  if (/fixe|stable|fisse|fixes/i.test(c)) push("term_fixed_fees");
  if (/transparen|fair|eque/i.test(c)) push("register_transparency");
  if (/word order|in the middle|at the end/i.test(comment)) push("word_order");
  if (/article|missing/i.test(comment)) push("missing_article");
  if (/capital|punctuation/i.test(comment)) push("punctuation_case");
  if (/eleva|migliora|consulenza|supporto/i.test(c)) push("verb_choice");
  if (/investi|investir|invest/i.test(comment)) push("verb_choice");
  if (/agisci|inizia|act now/i.test(c)) push("verb_choice");
  if (/voordel|goedkoop/i.test(c)) push("register_value");
  if (/handelsplatform|tradingplatform|makelaar|broker/i.test(c)) push("term_broker");
  if (/eparg|economis|saving|ahorr|risparm/i.test(c)) push("term_saving");
  if (/propuls|aliment|powered/i.test(c)) push("term_ai_powered");
  if (codes.length === 0) push("style_register");
  return codes;
}

// ── Pretty-print for dry-run ────────────────────────────────────────────────
function fmtRow(locale: string, row: ParsedRow, codes: string[]): string {
  const lines = [
    `  [${locale}] ${row.source}`,
    `    output:    ${row.output}`,
    `    corrected: ${row.correct}`,
    `    comment:   ${row.comment || "(none)"}`,
    `    codes:     ${codes.join(", ")}`,
  ];
  return lines.join("\n");
}

// ── DB insertion ────────────────────────────────────────────────────────────
async function insertReviewForRow(
  locale: Locale,
  row: ParsedRow,
  codes: string[],
): Promise<{ inserted: number }> {
  let inserted = 0;
  for (const textType of TARGET_TEXT_TYPES) {
    const job = await prisma.translationJob.create({
      data: {
        sourceText: row.source,
        sourceLanguage: "en",
        targetLocale: locale,
        textType,
        persona: "csv_import",
        tone: "marketing",
        outputCount: 1,
        status: "completed",
        createdByUserId: null,
      },
    });
    const output = await prisma.translationOutput.create({
      data: {
        jobId: job.id,
        outputText: row.output,
        version: 1,
        approved: false,
      },
    });
    await prisma.translationReview.create({
      data: {
        outputId: output.id,
        decision: "rejected",
        note: row.comment || null,
        issueCodes: JSON.stringify(codes),
        correctedTranslation: row.correct,
        reviewerId: REVIEWER_TAG,
        reviewerUserId: null,
      },
    });
    inserted++;
  }
  return { inserted };
}

// ── Main ────────────────────────────────────────────────────────────────────
async function main() {
  const argv = process.argv.slice(2);
  const dryRun = argv.includes("--dry-run") || !argv.includes("--apply");
  if (dryRun && !argv.includes("--dry-run")) {
    console.log("No mode flag — defaulting to --dry-run. Pass --apply to write to the DB.");
  }

  const summary: Record<string, { reviewed: number; skippedEmpty: number; codeCounts: Record<string, number> }> = {};
  let totalInserts = 0;

  for (const locale of LOCALES) {
    const file = path.join(CSV_DIR, `${locale}.csv`);
    let raw: string;
    try {
      raw = await fs.readFile(file, "utf8");
    } catch {
      console.warn(`! No CSV for ${locale} at ${file} — skipping`);
      continue;
    }
    const parsed = parseCsv(raw);
    const reviewed = parsed.filter((r) => r.correct !== "");
    const skipped = parsed.length - reviewed.length;
    const codeCounts: Record<string, number> = {};

    console.log(`\n=== ${locale} === (${reviewed.length} reviewed, ${skipped} unreviewed)`);

    for (const row of reviewed) {
      const cleaned: ParsedRow = {
        source: row.source,
        output: clean(row.output),
        correct: pickPrimaryAlternative(clean(row.correct)),
        comment: clean(row.comment),
      };
      const codes = deriveIssueCodes(cleaned.comment, cleaned.output, cleaned.correct);
      for (const code of codes) codeCounts[code] = (codeCounts[code] ?? 0) + 1;

      if (dryRun) {
        console.log(fmtRow(locale, cleaned, codes));
      } else {
        const { inserted } = await insertReviewForRow(locale, cleaned, codes);
        totalInserts += inserted;
      }
    }

    summary[locale] = { reviewed: reviewed.length, skippedEmpty: skipped, codeCounts };
  }

  console.log("\n=== Summary ===");
  for (const [locale, s] of Object.entries(summary)) {
    const topCodes = Object.entries(s.codeCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 6)
      .map(([c, n]) => `${c}=${n}`)
      .join(", ");
    console.log(`  ${locale}: ${s.reviewed} reviewed, ${s.skippedEmpty} skipped. Codes: ${topCodes}`);
  }
  if (dryRun) {
    const total = Object.values(summary).reduce((a, s) => a + s.reviewed, 0);
    console.log(
      `\nDRY RUN. Would insert ${total * TARGET_TEXT_TYPES.length} TranslationReview rows ` +
        `(${total} per-row × ${TARGET_TEXT_TYPES.length} textTypes).`,
    );
    console.log("Re-run with --apply to write to the DB.");
  } else {
    console.log(`\nAPPLIED. Inserted ${totalInserts} TranslationReview rows.`);
  }
}

main()
  .catch((err) => {
    console.error("Import failed:", err);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
