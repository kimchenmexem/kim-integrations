// scripts/test-locale-contract.ts
//
// Task 2 — banner ↔ translator locale contract.
//
// Proves:
//   1. Every supported locale parses to itself.
//   2. Legacy 2-letter codes coerce to their regional locale (en→en-GB, …).
//   3. Unsupported legacy locales (he, ar) and unknown values are REJECTED —
//      a cheap 400 before any expensive generation.
//   4. LANG_META covers exactly the supported set (exhaustive).
//   5. The banner translator client treats a 422 compliance_failed response as
//      a hard error (so the planner never proceeds with unsafe copy).
//
// Run: npm run test:locale

import {
  LanguageSchema,
  LANGUAGES,
  LANG_META,
  type Language,
} from "@/lib/i18n/language";
import {
  fetchCampaignCopyBatch,
  MarketingTranslatorError,
} from "@/lib/marketing-translator/client";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures += 1;
    console.error(`  ✗ ${msg}`);
  }
}

function parses(input: unknown, expected: Language): boolean {
  const r = LanguageSchema.safeParse(input);
  return r.success && r.data === expected;
}
function rejects(input: unknown): boolean {
  return !LanguageSchema.safeParse(input).success;
}

async function main(): Promise<void> {
  console.log("locale contract:");

  // 1. Supported locales parse to themselves.
  for (const loc of LANGUAGES) {
    assert(parses(loc, loc), `"${loc}" is accepted`);
  }

  // 2. Legacy short codes coerce.
  assert(parses("en", "en-GB"), 'legacy "en" → "en-GB"');
  assert(parses("fr", "fr-FR"), 'legacy "fr" → "fr-FR"');
  assert(parses("it", "it-IT"), 'legacy "it" → "it-IT"');
  assert(parses("nl", "nl-NL"), 'legacy "nl" → "nl-NL"');

  // 3. Unsupported / unknown are rejected.
  assert(rejects("he"), '"he" (Hebrew) is rejected — translator has no pipeline');
  assert(rejects("ar"), '"ar" (Arabic) is rejected');
  assert(rejects("de-DE"), 'unknown locale "de-DE" is rejected');
  assert(rejects("klingon"), "garbage is rejected");

  // default
  assert(LanguageSchema.parse(undefined) === "en-GB", "undefined defaults to en-GB");

  // 4. LANG_META is exhaustive.
  for (const loc of LANGUAGES) {
    assert(Boolean(LANG_META[loc]), `LANG_META has an entry for "${loc}"`);
  }
  assert(
    Object.keys(LANG_META).length === LANGUAGES.length,
    "LANG_META has no extra/missing locales",
  );

  // 5. Translator client fails hard on a 422 compliance_failed response.
  const realFetch = globalThis.fetch;
  (globalThis as { fetch: typeof fetch }).fetch = (async () =>
    new Response(
      JSON.stringify({
        error: "compliance_failed",
        message: "blocked",
        locale: "en-GB",
        blockedFields: [{ conceptId: "c1", field: "headline", finalAction: "blocked" }],
        compliance: { ok: false, decision: "NON_COMPLIANT", fields: [] },
      }),
      { status: 422, headers: { "content-type": "application/json" } },
    )) as typeof fetch;

  try {
    let caught: unknown;
    try {
      await fetchCampaignCopyBatch(
        {
          brief: { marketingMessage: "Trade global markets", campaignGoal: "awareness" },
          targetLocale: "en-GB",
          tone: "confident",
          concepts: [{ conceptId: "c1" }],
        },
        { baseUrl: "http://translator.local", apiKey: "test-key" },
      );
      caught = null;
    } catch (err) {
      caught = err;
    }
    const isMtErr = caught instanceof MarketingTranslatorError;
    assert(isMtErr, "422 compliance_failed throws MarketingTranslatorError (planner stops)");
    if (isMtErr) {
      const e = caught as MarketingTranslatorError;
      assert(e.status === 422, "error status is 422");
      assert(
        (e.body as { error?: string })?.error === "compliance_failed",
        "structured body.error === compliance_failed is surfaced",
      );
      assert(/c1\.headline=blocked/.test(e.message), "message names the blocked field");
    }
  } finally {
    globalThis.fetch = realFetch;
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll locale contract assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
