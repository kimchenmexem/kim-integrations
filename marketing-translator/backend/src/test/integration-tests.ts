/**
 * Integration tests — real Express + real HTTP, mocked OpenAI upstream.
 *
 * Run with:
 *   npm --workspace backend run test:integration
 *
 * What this covers:
 *   - /api/compliance/admin/* — 401 (no header), 403 (wrong token), pass-through (correct token)
 *   - /api/batch — one locale succeeds, one locale returns status="failed" (empty content)
 *   - /api/batch — non-cell infrastructural failure (QG provider 500) bubbles to 5xx
 *
 * Strategy:
 *   1. Set required env vars BEFORE any transitive import (dotenv defaults to
 *      override:false so it won't clobber values we set first).
 *   2. Start a local HTTP server that impersonates OpenAI chat-completions.
 *   3. Set OPENAI_BASE_URL to the mock.
 *   4. Import app. lazyOpenAI defers actual client construction until the
 *      first request, so env is live by then.
 */

// ─── Env setup (must run before any transitive import) ─────────────
process.env.ADMIN_TOKEN = "integration-test-token";
process.env.OPENAI_API_KEY = "test-key";
process.env.OPENAI_MAX_RETRIES = "0";
// OPENAI_BASE_URL is filled in after the mock server binds a port.

import http from "http";
import { AddressInfo } from "net";
import app from "../app";

// ─── Harness ───────────────────────────────────────────────────────
let passed = 0;
let failed = 0;
const failures: string[] = [];
function assert(condition: boolean, name: string) {
  if (condition) { passed++; console.log(`  ✓ ${name}`); }
  else { failed++; failures.push(name); console.error(`  ✖ FAIL: ${name}`); }
}
function section(name: string) { console.log(`\n═══ ${name} ═══`); }

// ─── Mock OpenAI server ────────────────────────────────────────────
type MockResponder = (body: any) => { status: number; body: any };
let currentResponder: MockResponder = () => ({ status: 200, body: { choices: [{ message: { content: "default" } }] } });

function startMockOpenAI(): Promise<{ baseUrl: string; close: () => Promise<void> }> {
  return new Promise((resolve) => {
    const server = http.createServer((req, res) => {
      let data = "";
      req.on("data", (chunk) => (data += chunk));
      req.on("end", () => {
        let body: any = null;
        try { body = JSON.parse(data); } catch { /* ignore */ }
        let out;
        try { out = currentResponder(body); }
        catch (err: any) { out = { status: 500, body: { error: String(err?.message ?? err) } }; }
        res.writeHead(out.status, { "Content-Type": "application/json" });
        res.end(JSON.stringify(out.body));
      });
    });
    server.listen(0, "127.0.0.1", () => {
      const port = (server.address() as AddressInfo).port;
      resolve({
        baseUrl: `http://127.0.0.1:${port}/v1`,
        close: () => new Promise((r) => server.close(() => r(undefined))),
      });
    });
  });
}

// ─── Interpreters for request body ─────────────────────────────────
function isQualityReviewCall(body: any): boolean {
  const sys = body?.messages?.find((m: any) => m.role === "system")?.content ?? "";
  // Matches the reviewer system prompt in translationQualityReview.ts
  return /translation quality reviewer|reviewing a translation/i.test(sys);
}
function targetLocaleFromSystem(body: any): string | null {
  const sys = body?.messages?.find((m: any) => m.role === "system")?.content ?? "";
  const m = sys.match(/\((it-IT|fr-FR|nl-NL|nl-BE|fr-BE|es-ES|en-GB)\)/);
  return m ? m[1] : null;
}
function okContent(text: string) {
  return { status: 200, body: { choices: [{ message: { content: text } }] } };
}
function okJSON(obj: any) {
  return okContent(JSON.stringify(obj));
}

// ─── Tests ─────────────────────────────────────────────────────────

async function testAdminAuth(url: string) {
  section("/api/compliance/admin — real HTTP auth");

  const noHeader = await fetch(`${url}/api/compliance/admin/obligations`);
  assert(noHeader.status === 401, "GET /obligations without header -> 401");
  const noBody = await noHeader.json() as any;
  assert(noBody.error === "Missing X-Admin-Token header.", "401 body is stable public message");

  const wrong = await fetch(`${url}/api/compliance/admin/obligations`, {
    headers: { "X-Admin-Token": "wrong-value" },
  });
  assert(wrong.status === 403, "GET with wrong token -> 403");
  const wrongBody = await wrong.json() as any;
  assert(wrongBody.error === "Invalid admin token.", "403 body is stable public message");

  // Correct token + intentionally invalid body — Zod returns 400, which proves
  // the middleware allowed the request through to the handler.
  const good = await fetch(`${url}/api/compliance/admin/obligations`, {
    method: "POST",
    headers: { "X-Admin-Token": "integration-test-token", "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  assert(good.status === 400, "POST with correct token reaches handler (Zod -> 400)");
}

async function testBatchMixedSuccessFailure(url: string, setResponder: (r: MockResponder) => void) {
  section("/api/batch — mixed success / empty-content failure");

  setResponder((body) => {
    if (isQualityReviewCall(body)) {
      return okJSON({ approved: true, score: 0.95, issues: [], repairInstructions: [], fixedTranslation: null });
    }
    const locale = targetLocaleFromSystem(body);
    if (locale === "fr-FR") return okContent(""); // -> EmptyTranslationError -> cell failed
    if (locale === "it-IT") return okContent("CIAO MEXEM");
    return okContent("default");
  });

  const resp = await fetch(`${url}/api/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texts: ["Invest with MEXEM."],
      locales: ["it-IT", "fr-FR"],
    }),
  });
  assert(resp.status === 200, `HTTP 200 returned (per-item status, not global failure) — got ${resp.status}`);

  const body = await resp.json() as any;
  assert(Array.isArray(body.results) && body.results.length === 1, "one results row (one source text)");
  const row = body.results[0];
  const it = row.translations["it-IT"];
  const fr = row.translations["fr-FR"];

  assert(it?.status === "ok", `it-IT cell has status=ok (got ${it?.status})`);
  assert(typeof it?.text === "string" && it.text.length > 0, "it-IT cell has non-empty text");
  assert(it?.text !== "Invest with MEXEM.", "it-IT cell is NOT the source text");

  assert(fr?.status === "failed", `fr-FR cell has status=failed (got ${fr?.status})`);
  assert(fr?.text === "", `fr-FR cell has empty text (got "${fr?.text}")`);
  assert(fr?.text !== "Invest with MEXEM.", "fr-FR cell does NOT echo source text");
  assert(fr?.error === "Model returned empty response.", `fr-FR carries stable public error (got "${fr?.error}")`);
}

async function testBatchInfrastructuralFailure(url: string, setResponder: (r: MockResponder) => void) {
  section("/api/batch — non-cell provider failure bubbles as 5xx");

  setResponder((body) => {
    // Translate call returns HTTP 500. The OpenAI SDK throws APIError — that
    // is NOT EmptyTranslationError, so the narrowed cell catch re-throws.
    if (!isQualityReviewCall(body)) {
      return { status: 500, body: { error: { message: "simulated provider 500" } } };
    }
    return okJSON({ approved: true, score: 0.95, issues: [], repairInstructions: [], fixedTranslation: null });
  });

  const resp = await fetch(`${url}/api/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texts: ["Invest with MEXEM."],
      locales: ["it-IT"],
    }),
  });
  assert(resp.status >= 500 && resp.status < 600, `non-cell failure returns 5xx (got ${resp.status})`);
  const body = await resp.json() as any;
  assert(body.error === "Batch translation failed.", "outer error body is stable public message");
  assert(!("reason" in body), "outer error body does NOT leak provider reason");
}

async function testBatchQGReviewerFailure(url: string, setResponder: (r: MockResponder) => void) {
  section("/api/batch — QG reviewer provider failure bubbles as 5xx (no fake-approve)");

  setResponder((body) => {
    // Primary translate succeeds. The QG reviewer call fails with HTTP 500.
    // Before the follow-up fix, reviewTranslationQuality swallowed this and
    // returned { approved:true, score:0.5 }, turning a real provider outage
    // into a fake-success cell. After the fix, the error propagates through
    // runQualityGate → cell (narrow catch re-throws non-Empty errors) →
    // outer 500 with a stable public message.
    if (isQualityReviewCall(body)) {
      return { status: 500, body: { error: { message: "simulated QG reviewer failure" } } };
    }
    return okContent("Ciao MEXEM");
  });

  const resp = await fetch(`${url}/api/batch`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      texts: ["Invest with MEXEM."],
      locales: ["it-IT"],
    }),
  });
  assert(resp.status >= 500 && resp.status < 600, `QG reviewer failure returns 5xx (got ${resp.status})`);
  const body = await resp.json() as any;
  assert(body.error === "Batch translation failed.", "outer error body is stable public message");
  assert(!("reason" in body), "outer error body does NOT leak provider reason");
  assert(!("results" in body), "response does NOT contain a 200-shaped results array (no fake approve)");
}

// ─── Run ───────────────────────────────────────────────────────────
(async function run() {
  console.log("Integration tests (real Express + mock OpenAI)\n");

  const mock = await startMockOpenAI();
  process.env.OPENAI_BASE_URL = mock.baseUrl;

  const server = app.listen(0, "127.0.0.1");
  await new Promise<void>((r) => server.once("listening", () => r()));
  const port = (server.address() as AddressInfo).port;
  const url = `http://127.0.0.1:${port}`;
  const setResponder = (r: MockResponder) => { currentResponder = r; };

  try {
    await testAdminAuth(url);
    await testBatchMixedSuccessFailure(url, setResponder);
    await testBatchInfrastructuralFailure(url, setResponder);
    await testBatchQGReviewerFailure(url, setResponder);
  } catch (err: any) {
    console.error("Unexpected error in harness:", err);
    failed++;
  } finally {
    await new Promise<void>((r) => server.close(() => r()));
    await mock.close();
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
