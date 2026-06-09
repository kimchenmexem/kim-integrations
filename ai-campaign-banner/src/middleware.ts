import { NextRequest, NextResponse } from "next/server";

// HTTP Basic Auth gate for the deployed Render service.
//
// When BASIC_AUTH_USER + BASIC_AUTH_PASSWORD are set, every request must
// present a matching `Authorization: Basic <base64>` header. The browser
// prompts on the first hit and caches credentials per host. When either
// env var is unset (e.g. local dev) the gate is a no-op.
//
// Tradeoffs vs. SSO: zero infra, one shared password — perfectly fine for
// an internal company tool, terrible for anything user-attributable. If
// per-user audit becomes a requirement, swap this for Clerk or a reverse
// proxy that does SAML/OIDC.

const REALM = "ai-campaign-banner";

export function middleware(request: NextRequest): NextResponse {
  const user = process.env.BASIC_AUTH_USER;
  const password = process.env.BASIC_AUTH_PASSWORD;
  if (!user || !password) {
    return NextResponse.next();
  }

  const header = request.headers.get("authorization");
  if (header) {
    const [scheme, encoded] = header.split(" ");
    if (scheme === "Basic" && encoded) {
      try {
        const decoded = atob(encoded);
        const idx = decoded.indexOf(":");
        if (idx >= 0) {
          const presentedUser = decoded.slice(0, idx);
          const presentedPass = decoded.slice(idx + 1);
          if (presentedUser === user && presentedPass === password) {
            return NextResponse.next();
          }
        }
      } catch {
        // fall through to 401
      }
    }
  }

  return new NextResponse("Authentication required.", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}", charset="UTF-8"` },
  });
}

// Only run on real pages — skip Next.js internals so the 401 doesn't break
// asset prefetches. The browser still sends the cached credentials on those,
// so once authed, everything works.
export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
