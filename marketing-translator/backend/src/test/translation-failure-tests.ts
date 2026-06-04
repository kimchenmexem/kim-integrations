/**
 * Tests for translation-failure propagation.
 *
 * Run with:
 *   npm --workspace backend run test:translation-failures
 *
 * Proves the translation pipeline no longer silently returns the source text
 * when the model returns nothing or when config is missing. Covers:
 *   - extractTranslation helper: throws on empty/missing content, returns trimmed text otherwise
 *   - translateToLocale: throws (not silently returns source) when OPENAI_API_KEY is unset
 *
 * No network calls — we construct fake OpenAI response shapes directly and
 * run against the pure helper. The OPENAI_API_KEY path is a pre-flight env
 * check that triggers before any SDK call.
 */

import { extractTranslation, EmptyTranslationError } from "../services/openaiHelpers";
import { translateToLocale } from "../services/ai";

let passed = 0;
let failed = 0;
const failures: string[] = [];

function assert(condition: boolean, name: string) {
  if (condition) {
    passed++;
    console.log(`  ✓ ${name}`);
  } else {
    failed++;
    failures.push(name);
    console.error(`  ✖ FAIL: ${name}`);
  }
}

function section(name: string) {
  console.log(`\n═══ ${name} ═══`);
}

function threw<T>(fn: () => T): { didThrow: boolean; message: string } {
  try {
    fn();
    return { didThrow: false, message: "" };
  } catch (err: any) {
    return { didThrow: true, message: String(err?.message ?? err) };
  }
}

async function threwAsync<T>(fn: () => Promise<T>): Promise<{ didThrow: boolean; message: string }> {
  try {
    await fn();
    return { didThrow: false, message: "" };
  } catch (err: any) {
    return { didThrow: true, message: String(err?.message ?? err) };
  }
}

// ─── extractTranslation ────────────────────────────────────────────

function testExtractOnNullResponse() {
  section("extractTranslation — null/undefined response");
  const r1 = threw(() => extractTranslation(null as any));
  assert(r1.didThrow, "throws on null response");
  assert(r1.message.includes("empty content"), "error message mentions empty content");

  let thrown: unknown = null;
  try { extractTranslation(null as any); } catch (e) { thrown = e; }
  assert(thrown instanceof EmptyTranslationError, "throws EmptyTranslationError (narrow type)");

  const r2 = threw(() => extractTranslation(undefined as any));
  assert(r2.didThrow, "throws on undefined response");
}

function testExtractOnNoChoices() {
  section("extractTranslation — no choices array");
  const resp: any = {};
  const r = threw(() => extractTranslation(resp));
  assert(r.didThrow, "throws when choices is missing");

  const resp2: any = { choices: [] };
  const r2 = threw(() => extractTranslation(resp2));
  assert(r2.didThrow, "throws when choices is empty");
}

function testExtractOnEmptyContent() {
  section("extractTranslation — empty content");
  const resp: any = { choices: [{ message: { content: "" } }] };
  const r = threw(() => extractTranslation(resp));
  assert(r.didThrow, "throws when content is empty string");

  const resp2: any = { choices: [{ message: { content: null } }] };
  const r2 = threw(() => extractTranslation(resp2));
  assert(r2.didThrow, "throws when content is null");

  const resp3: any = { choices: [{ message: { content: "   \n\t  " } }] };
  const r3 = threw(() => extractTranslation(resp3));
  assert(r3.didThrow, "throws when content is whitespace-only");
}

function testExtractDoesNotFallBackToSource() {
  section("extractTranslation — never substitutes source text");
  const resp: any = { choices: [{ message: { content: "" } }] };
  const r = threw(() => extractTranslation(resp));
  assert(r.didThrow, "empty content produces an error, not source text");
  // The key invariant: no way to call extractTranslation and get back any string
  // other than the non-empty model output. Source text is never an argument.
  assert(
    !r.message.toLowerCase().includes("source"),
    "error does not claim success by referencing source"
  );
}

function testExtractOnValidContent() {
  section("extractTranslation — valid content");
  const resp: any = { choices: [{ message: { content: "  Ciao MEXEM  " } }] };
  const out = extractTranslation(resp);
  assert(out === "Ciao MEXEM", "trims whitespace and returns content");

  const resp2: any = {
    choices: [
      { message: { content: "first choice" } },
      { message: { content: "second choice" } },
    ],
  };
  assert(extractTranslation(resp2) === "first choice", "uses choices[0] when multiple present");
}

// ─── translateToLocale env guard ───────────────────────────────────

async function testTranslateToLocaleMissingKey() {
  section("translateToLocale — OPENAI_API_KEY unset");
  const prior = process.env.OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  const r = await threwAsync(() => translateToLocale("Invest with MEXEM.", "it-IT"));
  assert(r.didThrow, "throws when OPENAI_API_KEY is unset (no silent source-text fallback)");
  assert(
    r.message.includes("OPENAI_API_KEY"),
    "error message mentions the missing env var"
  );

  // Restore
  if (prior !== undefined) process.env.OPENAI_API_KEY = prior;
}

async function testTranslateToLocaleEmptyKey() {
  section("translateToLocale — OPENAI_API_KEY empty string");
  const prior = process.env.OPENAI_API_KEY;
  process.env.OPENAI_API_KEY = "";

  const r = await threwAsync(() => translateToLocale("Invest with MEXEM.", "it-IT"));
  assert(r.didThrow, "throws when OPENAI_API_KEY is empty string");

  if (prior !== undefined) process.env.OPENAI_API_KEY = prior;
  else delete process.env.OPENAI_API_KEY;
}

// ─── Batch per-item failure shape ──────────────────────────────────

/**
 * Exercises the per-cell try/catch shape used in routes/batch.ts. Rather than
 * booting Express + OpenAI, we simulate the exact wrapper around a translate
 * call and assert: on error, the cell gets { status: "failed", text: "",
 * error } — NEVER the source text as "text".
 */
async function testBatchCellFailureShape() {
  section("batch per-item failure shape");

  const SOURCE_TEXT = "Invest with MEXEM.";

  type Cell =
    | { status: "ok"; text: string }
    | { status: "failed"; text: string; error: string };

  async function translateCell(
    source: string,
    translateFn: () => Promise<string>,
  ): Promise<Cell> {
    try {
      const text = await translateFn();
      return { status: "ok", text };
    } catch (err: any) {
      return {
        status: "failed",
        text: "",
        error: String(err?.message ?? "Translation failed"),
      };
    }
  }

  // Success path
  const ok = await translateCell(SOURCE_TEXT, async () => "Investi con MEXEM.");
  assert(ok.status === "ok", "success cell has status=ok");
  assert(ok.text === "Investi con MEXEM.", "success cell carries the real translation");

  // Failure path — underlying translate throws (as extractTranslation now does)
  const fail = await translateCell(SOURCE_TEXT, async () => {
    throw new Error("Translation failed: model returned empty content.");
  });
  assert(fail.status === "failed", "failure cell has status=failed");
  assert(fail.text === "", "failure cell has empty text, not the source text");
  assert(fail.text !== SOURCE_TEXT, "failure cell MUST NOT echo source text as translation");
  assert(
    fail.status === "failed" && fail.error.includes("empty content"),
    "failure cell carries the real error message",
  );

  // Mixed batch — one fail, one ok — both cells present, per-item status
  const batch = await Promise.all([
    translateCell("A", async () => "Ciao A"),
    translateCell("B", async () => { throw new Error("upstream 500"); }),
  ]);
  assert(batch[0].status === "ok" && batch[0].text === "Ciao A", "mixed batch: first cell ok");
  assert(batch[1].status === "failed", "mixed batch: second cell failed");
  assert(
    batch[1].status === "failed" && batch[1].error === "upstream 500",
    "mixed batch: second cell carries upstream error",
  );
}

// ─── Run ────────────────────────────────────────────────────────────
(async function run() {
  console.log("Translation failure propagation tests\n");
  try {
    testExtractOnNullResponse();
    testExtractOnNoChoices();
    testExtractOnEmptyContent();
    testExtractDoesNotFallBackToSource();
    testExtractOnValidContent();
    await testTranslateToLocaleMissingKey();
    await testTranslateToLocaleEmptyKey();
    await testBatchCellFailureShape();
  } catch (err: any) {
    console.error("Unexpected error in test harness:", err);
    failed++;
  }

  console.log(`\n═══ Results ═══`);
  console.log(`  passed: ${passed}`);
  console.log(`  failed: ${failed}`);
  if (failed > 0) {
    console.error("Failures:\n" + failures.map(f => `  - ${f}`).join("\n"));
    process.exit(1);
  }
  process.exit(0);
})();
