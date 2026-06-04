/**
 * Unit tests for the admin-token middleware.
 *
 * Run with:
 *   npm --workspace backend run test:admin-auth
 *
 * No network, no DB. Exercises requireAdminToken directly against mock
 * req/res/next and verifies every response branch: missing env, missing
 * header, wrong token, correct token. Also sanity-checks constantTimeEqual
 * on mismatched-length inputs.
 */

import { requireAdminToken, constantTimeEqual } from "../middleware/adminAuth";

// ─── Mini harness ──────────────────────────────────────────────────
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

// ─── Mock req/res/next ─────────────────────────────────────────────
function mockReq(headers: Record<string, string> = {}) {
  const lower: Record<string, string> = {};
  for (const [k, v] of Object.entries(headers)) lower[k.toLowerCase()] = v;
  return {
    header: (name: string) => lower[name.toLowerCase()],
  } as any;
}

function mockRes() {
  const state = { statusCode: 200, body: null as any };
  const res: any = {
    status(code: number) { state.statusCode = code; return res; },
    json(b: any) { state.body = b; return res; },
    get _statusCode() { return state.statusCode; },
    get _body() { return state.body; },
  };
  return res;
}

function mockNext() {
  const calls = { count: 0 };
  const fn: any = () => { calls.count++; };
  fn._calls = calls;
  return fn;
}

// ─── Tests ─────────────────────────────────────────────────────────

function testMissingEnv() {
  section("ADMIN_TOKEN not set on server");
  const prior = process.env.ADMIN_TOKEN;
  delete process.env.ADMIN_TOKEN;

  const req = mockReq({ "X-Admin-Token": "anything" });
  const res = mockRes();
  const next = mockNext();
  requireAdminToken(req, res, next);

  assert(res._statusCode === 500, "responds 500 when ADMIN_TOKEN env is unset");
  assert(
    res._body?.error?.includes("ADMIN_TOKEN not set"),
    "500 body mentions misconfiguration"
  );
  assert(next._calls.count === 0, "does not call next() when misconfigured");

  // Restore
  if (prior !== undefined) process.env.ADMIN_TOKEN = prior;
}

function testEmptyEnv() {
  section("ADMIN_TOKEN set to empty string");
  process.env.ADMIN_TOKEN = "";

  const req = mockReq({ "X-Admin-Token": "anything" });
  const res = mockRes();
  const next = mockNext();
  requireAdminToken(req, res, next);

  assert(res._statusCode === 500, "empty ADMIN_TOKEN is treated as unset (500)");
  assert(next._calls.count === 0, "does not call next() on empty env");
}

function testMissingHeader() {
  section("Request missing X-Admin-Token header");
  process.env.ADMIN_TOKEN = "s3cret-token-value";

  const req = mockReq({});
  const res = mockRes();
  const next = mockNext();
  requireAdminToken(req, res, next);

  assert(res._statusCode === 401, "responds 401 when header absent");
  assert(res._body?.error === "Missing X-Admin-Token header.", "401 body says header missing");
  assert(next._calls.count === 0, "does not call next() on missing header");
}

function testBlankHeader() {
  section("X-Admin-Token present but whitespace-only");
  process.env.ADMIN_TOKEN = "s3cret-token-value";

  const req = mockReq({ "X-Admin-Token": "   " });
  const res = mockRes();
  const next = mockNext();
  requireAdminToken(req, res, next);

  assert(res._statusCode === 401, "responds 401 when header is whitespace-only");
  assert(next._calls.count === 0, "does not call next() on blank header");
}

function testWrongToken() {
  section("X-Admin-Token mismatched");
  process.env.ADMIN_TOKEN = "s3cret-token-value";

  const req = mockReq({ "X-Admin-Token": "wrong-value" });
  const res = mockRes();
  const next = mockNext();
  requireAdminToken(req, res, next);

  assert(res._statusCode === 403, "responds 403 when token mismatched");
  assert(res._body?.error === "Invalid admin token.", "403 body says invalid");
  assert(next._calls.count === 0, "does not call next() on wrong token");
}

function testWrongLengthToken() {
  section("X-Admin-Token wrong length (still mismatched)");
  process.env.ADMIN_TOKEN = "s3cret-token-value";

  const req = mockReq({ "X-Admin-Token": "short" });
  const res = mockRes();
  const next = mockNext();

  // Must not throw even though buffer lengths differ.
  let threw = false;
  try { requireAdminToken(req, res, next); } catch { threw = true; }

  assert(!threw, "does not throw on mismatched-length tokens");
  assert(res._statusCode === 403, "responds 403 on wrong-length token");
  assert(next._calls.count === 0, "does not call next() on wrong-length token");
}

function testCorrectToken() {
  section("X-Admin-Token matches");
  process.env.ADMIN_TOKEN = "s3cret-token-value";

  const req = mockReq({ "X-Admin-Token": "s3cret-token-value" });
  const res = mockRes();
  const next = mockNext();
  requireAdminToken(req, res, next);

  assert(next._calls.count === 1, "calls next() exactly once on match");
  assert(res._statusCode === 200, "does not set an error status when valid");
  assert(res._body === null, "does not write a response body when valid");
}

function testTokenWithSurroundingWhitespace() {
  section("X-Admin-Token equals env value with surrounding whitespace");
  process.env.ADMIN_TOKEN = "s3cret-token-value";

  const req = mockReq({ "X-Admin-Token": "  s3cret-token-value  " });
  const res = mockRes();
  const next = mockNext();
  requireAdminToken(req, res, next);

  assert(next._calls.count === 1, "accepts token with surrounding whitespace (trimmed)");
}

function testConstantTimeEqualPure() {
  section("constantTimeEqual (pure)");
  assert(constantTimeEqual("abc", "abc") === true, "equal strings return true");
  assert(constantTimeEqual("abc", "abd") === false, "same-length differing strings return false");
  assert(constantTimeEqual("short", "much-longer-string") === false, "different-length strings return false without throwing");
  assert(constantTimeEqual("", "") === true, "empty strings are equal");
  assert(constantTimeEqual("a", "") === false, "empty vs nonempty is false");
}

// ─── Run ────────────────────────────────────────────────────────────
(function run() {
  console.log("Admin auth middleware tests\n");
  try {
    testMissingEnv();
    testEmptyEnv();
    testMissingHeader();
    testBlankHeader();
    testWrongToken();
    testWrongLengthToken();
    testCorrectToken();
    testTokenWithSurroundingWhitespace();
    testConstantTimeEqualPure();
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
