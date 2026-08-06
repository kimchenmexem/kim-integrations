// scripts/test-provider-retry.ts
//
// Task 6 — OpenAI provider JSON retry behavior.
//
// Exercises callWithJsonRetry in isolation (no network) to prove:
//   1. Invalid JSON on attempt 1 IS retried; valid JSON on attempt 2 succeeds.
//   2. A genuine API failure (ApiCallError) fails fast — NOT retried.
//   3. Persistent parse/schema failure surfaces the last error after N tries.
//   4. Valid JSON on attempt 1 returns immediately (single call).
//
// Run: npm run test:provider

import { callWithJsonRetry, ApiCallError } from "@/lib/ai/provider";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures += 1;
    console.error(`  ✗ ${msg}`);
  }
}

async function main(): Promise<void> {
  console.log("provider JSON retry:");

  // 1. Invalid JSON on attempt 1, valid on attempt 2 → retried, succeeds.
  {
    let calls = 0;
    const result = await callWithJsonRetry<{ ok: boolean }>(
      async (attempt) => {
        calls += 1;
        return attempt === 1 ? "definitely not json {{{" : '{"ok":true}';
      },
      (text) => JSON.parse(text),
      2,
    );
    assert(calls === 2, "invalid JSON on attempt 1 is retried (callModel called twice)");
    assert(result.ok === true, "valid JSON on attempt 2 is returned");
  }

  // 2. Genuine API error fails fast — not retried.
  {
    let calls = 0;
    let threw: unknown;
    try {
      await callWithJsonRetry(
        async () => {
          calls += 1;
          throw new ApiCallError("network down");
        },
        (text) => JSON.parse(text),
        2,
      );
    } catch (err) {
      threw = err;
    }
    assert(threw instanceof ApiCallError, "API error propagates as ApiCallError");
    assert(calls === 1, "API error is NOT retried (callModel called once)");
  }

  // 3. Persistent schema/parse failure → throws after maxAttempts.
  {
    let calls = 0;
    let threw = false;
    try {
      await callWithJsonRetry(
        async () => {
          calls += 1;
          return "still not json";
        },
        (text) => JSON.parse(text),
        3,
      );
    } catch {
      threw = true;
    }
    assert(threw, "persistent parse failure throws");
    assert(calls === 3, "parse failures are retried up to maxAttempts (3 calls)");
  }

  // 4. Valid JSON on attempt 1 → single call.
  {
    let calls = 0;
    const result = await callWithJsonRetry<{ n: number }>(
      async () => {
        calls += 1;
        return '{"n":42}';
      },
      (text) => JSON.parse(text),
      2,
    );
    assert(calls === 1 && result.n === 42, "valid JSON on attempt 1 returns without retry");
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll provider retry assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
