// scripts/test-api-guard.ts
//
// Task 1 — mutation/cost API route protection (src/middleware.ts).
//
// Proves the internal-key guard on non-GET /api routes:
//   - production + no auth configured        → 503 (fail closed)
//   - production + key set, no credentials    → 401
//   - production + key set, wrong credentials  → 403
//   - production + key set, correct x-internal-api-key → allowed
//   - dev + ALLOW_UNAUTHENTICATED_DEV_API=true → allowed (bypass)
//   - GET read route is never blocked by the mutation guard
//
// Run: npm run test:api-guard

import { NextRequest } from "next/server";

let failures = 0;
function assert(cond: boolean, msg: string): void {
  if (cond) console.log(`  ✓ ${msg}`);
  else {
    failures += 1;
    console.error(`  ✗ ${msg}`);
  }
}

const KEY = "test-internal-key-abc123";

// process.env.NODE_ENV is typed read-only by @types/node; assign via a cast.
const ENV = process.env as Record<string, string | undefined>;

function reset(env: Record<string, string | undefined>): void {
  delete ENV.BANNER_INTERNAL_API_KEY;
  delete ENV.BASIC_AUTH_USER;
  delete ENV.BASIC_AUTH_PASSWORD;
  delete ENV.ALLOW_UNAUTHENTICATED_DEV_API;
  ENV.NODE_ENV = "production";
  for (const [k, v] of Object.entries(env)) {
    if (v === undefined) delete ENV[k];
    else ENV[k] = v;
  }
}

function req(path: string, method: string, headers: Record<string, string> = {}): NextRequest {
  return new NextRequest(`http://localhost${path}`, { method, headers });
}

/** NextResponse.next() carries the x-middleware-next header; a blocked request is a real response. */
function isPassThrough(res: { headers: Headers; status: number }): boolean {
  return res.headers.get("x-middleware-next") === "1" || (res.status < 400 && res.headers.get("x-middleware-next") !== null);
}

async function main(): Promise<void> {
  const { middleware } = await import("@/middleware");
  console.log("api mutation guard:");

  reset({});
  {
    const res = middleware(req("/api/generate-campaign", "POST"));
    assert(res.status === 503, "prod + no auth configured → 503 (fail closed)");
  }

  reset({ BANNER_INTERNAL_API_KEY: KEY });
  {
    const res = middleware(req("/api/generate-campaign", "POST"));
    assert(res.status === 401, "prod + key set, no credentials → 401");
  }
  {
    const res = middleware(req("/api/generate-campaign", "POST", { authorization: "Bearer wrong" }));
    assert(res.status === 403, "prod + key set, wrong bearer → 403");
  }
  {
    const res = middleware(req("/api/generate-campaign", "POST", { "x-internal-api-key": KEY }));
    assert(isPassThrough(res), "prod + correct x-internal-api-key → allowed (pass-through)");
  }
  {
    const res = middleware(req("/api/generate-campaign", "POST", { authorization: `Bearer ${KEY}` }));
    assert(isPassThrough(res), "prod + correct Bearer token → allowed (pass-through)");
  }
  {
    // GET read route must not be blocked by the mutation guard (no Basic Auth configured).
    const res = middleware(req("/api/brand-kit", "GET"));
    assert(isPassThrough(res), "GET read route is not blocked by the mutation guard");
  }

  reset({ ALLOW_UNAUTHENTICATED_DEV_API: "true" });
  ENV.NODE_ENV = "development";
  {
    const res = middleware(req("/api/generate-campaign", "POST"));
    assert(isPassThrough(res), "dev + ALLOW_UNAUTHENTICATED_DEV_API=true → allowed");
  }

  if (failures > 0) {
    console.error(`\n${failures} assertion(s) failed.`);
    process.exit(1);
  }
  console.log("\nAll api guard assertions passed.");
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
