# CLAUDE.md — kim-integrations

Guidance for Claude Code when working in this repository.

This file is intentionally practical. Before editing, always inspect the actual code and package scripts. Do not rely only on this document or older READMEs.

---

## Repo overview

`kim-integrations` is a monorepo containing two independent TypeScript projects for MEXEM:

1. `ai-campaign-banner`
   - AI-assisted marketing banner generator.
   - Produces campaign concepts, deterministic Element Manifests, rendered PNG/SVG outputs, QA reports, and campaign storage artifacts.
   - AI may help with strategy/copy/visual intent, but layout/rendering must remain deterministic.

2. `marketing-translator`
   - Compliance-first marketing translation platform.
   - Translates English marketing copy into supported European locales.
   - Runs regulatory/compliance validation and must fail closed for production marketing copy.

The two projects connect at one point:

- `ai-campaign-banner` calls `marketing-translator` for localized/compliance-checked campaign copy.
- Banner generation must not fall back to unvalidated AI copy if the translator rejects, blocks, escalates, or returns non-2xx.

---

## Non-negotiable architecture rules

### Banner generator

- AI must not choose layout coordinates.
- AI must not generate arbitrary Element Manifest geometry.
- The Element Manifest is the single source of truth for rendering.
- Renderer must not invent layout positions or reflow ad content.
- Brand Kit is the authority for:
  - colors
  - fonts
  - logo usage
  - legal/risk copy
  - disclaimers
- Same persisted manifest + same assets + same renderer version should render deterministically.
- Same input request does not necessarily mean same `campaign_id` unless explicit idempotency is implemented.
- Do not modify generated campaign folders or active campaign pointers unless explicitly asked.

### Translator

- Compliance must fail closed.
- Do not return successful production copy when validation says:
  - non-compliant
  - blocked
  - uncertain
  - escalated
  - requires human review
- If the decision layer rewrites text to a safe final version, return the safe `finalText` and include metadata that a rewrite occurred.
- Do not treat compliance notes as sufficient approval.
- Do not log plaintext source/generated marketing copy into local logs.

### Security

- Never add real secrets to the repo.
- Never expose server secrets to browser/client bundles.
- Mutation/cost routes must be protected server-side.
- Public/read-only routes and health checks should remain accessible unless intentionally protected.
- Dev bypass flags must be explicit and must not be enabled in production.

---

## Important directories

### `ai-campaign-banner`

Common areas to inspect:

- `src/app/api/**`
  - Next.js API routes.
  - Pay attention to generation/render/export/upload/mutation routes.
- `src/middleware.ts`
  - API protection/rate limiting middleware.
  - Must remain Edge Runtime compatible.
  - Do not import Node-only APIs here.
- `src/lib/ai/**`
  - AI provider abstraction and campaign planner.
- `src/lib/marketing-translator/**`
  - Client used by banner to request approved localized copy.
- `src/lib/i18n/language.ts`
  - Locale definitions and legacy locale coercion.
- `src/lib/qa/**`
  - Deterministic QA gate.
- `src/lib/storage/**`
  - Campaign storage helpers.
  - Atomic JSON writes and file locking belong here.
- `src/lib/schemas/**`
  - Zod schemas for brand kit, request payloads, settings.
- `scripts/**`
  - Tests, generation utilities, rebuild scripts, evaluation scripts.
- `data/campaigns/**`, `data/active-campaign.generated.json`, `data/campaigns/index.generated.json`, `public/rendered-ads/**`
  - Generated campaign artifacts.
  - Avoid modifying unless explicitly asked.

### `marketing-translator`

Common areas to inspect:

- `backend/src/app.ts`
  - Express app setup, routes, CORS, rate limiters.
- `backend/src/routes/**`
  - API route handlers.
- `backend/src/routes/campaign-copy.ts`
  - Service-to-service endpoint consumed by banner.
- `backend/src/services/campaignCopy.ts`
  - Campaign copy generation and compliance gating.
- `backend/src/services/decision-layer.ts`
  - Compliance decision fusion and uncertain-case handling.
- `backend/src/middleware/auth.ts`
  - Clerk/local-user auth and RBAC.
- `backend/src/middleware/rateLimit.ts`
  - User/service/IP-aware rate limiting.
- `backend/prisma/**` or `prisma/**`
  - Prisma schema and migrations, depending on current layout.
  - (Current layout: `marketing-translator/prisma/schema.prisma`; backend scripts reference it via `../prisma/schema.prisma`.)
- `frontend/**`
  - Vite/React UI.
- `packages/shared/**`
  - Shared types and schemas used across frontend/backend.

---

## Supported banner/translator locales

The banner should use explicit translator-compatible BCP-47 locales.

Current intended supported locales:

- `it-IT`
- `fr-FR`
- `nl-NL`
- `nl-BE`
- `fr-BE`
- `es-ES`
- `en-GB`

Legacy short-code compatibility may exist only as a safe coercion layer:

- `en` → `en-GB`
- `fr` → `fr-FR`
- `it` → `it-IT`
- `nl` → `nl-NL`

Unsupported values such as `he`, `ar`, unknown strings, or partial unsupported locales must fail early with a clear 400 before any AI or rendering cost.

When changing locales:

- Update schemas.
- Update UI labels.
- Update planner mappings.
- Update translator request/response types.
- Update tests.
- Keep mappings exhaustive in TypeScript where possible.

---

## Environment variables

Always inspect `.env.example` files before changing env behavior.

### `ai-campaign-banner`

Important env vars may include:

- `BANNER_INTERNAL_API_KEY`
  - Server-side key for protected mutation/cost API routes.
- `BASIC_AUTH_USER`
- `BASIC_AUTH_PASSWORD`
  - Optional Basic Auth, usually for staging/admin UI.
- `ALLOW_UNAUTHENTICATED_DEV_API`
  - Explicit local/dev bypass only.
  - Must not be enabled in production.
- `BANNER_API_RATE_LIMIT_PER_MIN`
  - Rate limit for protected banner API routes.
- Translator service URL/key variables
  - Check actual `.env.example` and translator client code.
  - (Currently `MARKETING_TRANSLATOR_API_URL` + `MARKETING_TRANSLATOR_API_KEY`, the latter matching the translator's `CAMPAIGN_COPY_API_KEY`.)
- OpenAI/Anthropic/Gemini/Cloudinary/Supabase variables
  - Only use where server-side code needs them.
  - Never expose private keys to the browser.
  - Image generation is off by default (`AI_IMAGE_PROVIDER=none`).

### `marketing-translator`

Important env vars may include:

- `DATABASE_URL`
- `OPENAI_API_KEY`
- `CLERK_SECRET_KEY`
- Clerk frontend publishable key variables, where applicable.
- `ALLOWED_ORIGINS`
- Service-to-service API key for campaign-copy, if present.
  - (Currently `CAMPAIGN_COPY_API_KEY`.)
- Rate limit configuration variables, if present.
- `TRUST_PROXY=1` when running behind Render/any reverse proxy.

Never invent real secrets. Use placeholders only.

---

## Security and compliance checklist

- Banner mutation/cost `/api/*` routes require `BANNER_INTERNAL_API_KEY` (or valid Basic Auth). Production fails closed (503) if neither is configured.
- Missing credentials → 401; invalid credentials → 403; rate limited → 429.
- No client-side secrets — the guard runs in Edge middleware (server-only).
- Translator `/api/campaign-copy*` fails closed (422) on blocked/escalated/uncertain compliance; a "notes only" pass-through is not allowed.
- Rate limiting is user/service-aware (Clerk user id / service key), with IP as fallback only.
- Uncertain-case logs store a text hash + metadata, never the source/generated copy.
- Unsupported locales (`he`, `ar`, unknown) are rejected early with a 400 before any AI/render cost.

When touching any of these, preserve the invariant — do not relax it for convenience.

---

## Middleware rules (`ai-campaign-banner/src/middleware.ts`)

- Edge Runtime only. Import solely from `next/server`. Do NOT import `fs`/`path`/`node:crypto` or any storage/planner/server modules — that breaks the Edge bundle.
- Never expose secrets to the client. Keys are read from `process.env` inside the middleware and never reach the browser bundle.
- Two layers:
  1. Basic Auth gate (`BASIC_AUTH_USER`/`BASIC_AUTH_PASSWORD`) fronts all matched routes when configured; no-op when unset.
  2. Internal-key guard for mutation/cost routes: present `Authorization: Bearer <key>` or `x-internal-api-key: <key>` matching `BANNER_INTERNAL_API_KEY`. The authenticated browser (Basic Auth) is allowed through instead, so the key never lives in client code.
- The mutation guard fires ONLY for `/api/*` requests whose method is not `GET`/`HEAD`/`OPTIONS`. It must not block `_next/*`, static/public files, GET reads, or read-only routes.
- Dev bypass (`ALLOW_UNAUTHENTICATED_DEV_API=true`) works only when `NODE_ENV !== production`. Never enable it in production.
- The in-request rate check must stay synchronous and in-memory (no `await`/`setTimeout` in the request path). It is per-instance only — document the multi-instance limitation (see Storage section).

---

## Campaign-copy fail-closed behavior

- Endpoint: `POST /api/campaign-copy` (and `/batch`, `/by-message`) in the translator backend.
- Every generated field runs through the dual-validator decision layer. Only `auto_approved` or safely `rewritten` fields may ship.
- If any field is blocked, escalated to human review, or uncertain, the endpoint returns HTTP 422 with a structured body:
  - `{ error: "compliance_failed", message, locale, blockedFields[], compliance }`
  - each field entry: `{ field, conceptId?, status, finalAction, confidence, rewritten, shippable, issues[] }`
- On a safe rewrite, the response ships `finalText` and sets `rewritten: true` in the field metadata.
- The banner's translator client (`ai-campaign-banner/src/lib/marketing-translator/client.ts`) treats any non-2xx (including 422) as a hard error; the planner must not build or render a manifest from unsafe copy.

---

## Logging and audit privacy

- Never write source text or generated marketing copy to local log files or console.
- The uncertain-case log (`backend/src/services/decision-layer.ts`) records only: text SHA-256 + length, locale, decision statuses, risk, confidence, `finalAction`, issue count, bundle rule types/severities, and validator classifications/confidences — never the text or the validators' verbatim quotes/violations.
- If full text is genuinely needed for a reviewer/legal workflow, persist it in the database models (which carry access controls + audit trail), not in an unstructured local log.
- Redact secrets (`Bearer …`, `api_key=…`, `sk-…`) from any error string before logging or throwing.

---

## Storage and generated files

- Banner campaign state lives in:
  - `data/campaigns/**` (per-campaign folders)
  - `data/campaigns/index.generated.json` (campaign index)
  - `data/active-campaign.generated.json` (active pointer)
  - `public/rendered-ads/**` (rendered PNG outputs)
- The index and active pointer are written atomically (temp file + rename) under a file lock — see `ai-campaign-banner/src/lib/storage/atomicJson.ts` (`writeJsonAtomic`, `withFileLock`).
- These file locks and the atomic rename are single-instance only. On a multi-instance deployment they do not coordinate across hosts; move this state to a database if scaling past one instance.
- Do not modify generated campaign folders or the active-campaign pointer unless explicitly asked.

---

## Common commands

Always verify scripts in each `package.json` before running.

### `ai-campaign-banner`

Likely commands:

```bash
cd ai-campaign-banner
npm install
npm run typecheck
npm run test
npm run build
```

Focused test scripts (network-free):

```bash
npm run test:provider     # OpenAI JSON/schema retry vs. API-error fast-fail
npm run test:locale       # locale contract + translator-client 422 fail-closed
npm run test:api-guard     # mutation-route auth guard (401/403/503/dev-bypass)
npm run test:zones        # canonical MEXEM zone contract
npm run lint
npm run dev               # next dev on :3000
```

### `marketing-translator`

npm workspaces (backend, frontend, packages/shared). Likely commands:

```bash
cd marketing-translator
npm ci
npm run typecheck          # builds packages/shared, then tsc --noEmit backend
npm run build              # shared → backend → frontend
npm run dev                # backend :4000 + frontend :5173 (concurrently)
npm run migrate:deploy     # apply Prisma migrations
```

Backend-scoped focused test (network-free):

```bash
npm --workspace backend run test:campaign-copy   # compliance fail-closed gating
```

Note: `@mexem/shared` must be built before the backend typechecks against it. `npm run typecheck` (root) does this for you; a bare `tsc` in `backend/` after editing shared types uses stale `dist/`.

---

## Testing expectations

Fast, network-free tests exist for the hardened areas — run the ones for the project you touched:

- Locale contract (accept supported, coerce legacy, reject `ar`/`he`): `ai-campaign-banner: npm run test:locale`.
- Compliance fail-closed gating (blocked/escalated cannot ship): `marketing-translator/backend: npm run test:campaign-copy`.
- Mutation-route auth guard (401/403/503/dev bypass): `ai-campaign-banner: npm run test:api-guard`.
- Provider JSON/schema retry vs. API-error fast-fail: `ai-campaign-banner: npm run test:provider`.
- Storage atomic-write/lock: covered by `src/lib/storage/atomicJson.ts` design; add a concurrency test if you extend it.

Before handoff: run `ai-campaign-banner: npm run typecheck && npm run test` and `marketing-translator: npm run typecheck && npm run build`. For real production confidence on the banner, also run `ai-campaign-banner: npm run build` — `tsc --noEmit` does not catch Next.js App Router / middleware / Edge Runtime / bundling issues.

---

## Development workflow

1. Inspect before editing — read the actual file; verify claims against code.
2. Keep changes scoped to the task; do not refactor unrelated code.
3. Run the relevant checks (typecheck + focused tests) for the project you touched.
4. Document failures honestly — if a command fails for a pre-existing/unrelated reason, say so with the output.
5. Do not commit unless explicitly asked. Never add real secrets.
6. Do not modify generated campaign data unless explicitly asked.

---

## Final response format after code changes

When you finish a code change, report:

1. Short summary of what changed.
2. Files changed, grouped by project.
3. Commands run, and whether each passed or failed.
4. Tests added or updated.
5. Behavior changes / migration notes.
6. Remaining risks or follow-up items.

Be honest. If something could not be fully fixed, state exactly why and what remains. If a command failed for a pre-existing/unrelated reason, say so with the output rather than hiding it.

---

## Deployment notes

- `ai-campaign-banner`: Docker image (Playwright base) on Render; standalone Next output; persistent disk at `/app/storage` with `data/` and rendered outputs symlinked onto it; port 10000. Protected by Basic Auth + the internal API-key mutation guard.
- `marketing-translator`: backend on Render, frontend on Vercel, Postgres on Neon/Render, auth via Clerk.
- File-storage limitations (single-instance): the banner's campaign index/active pointer are JSON files guarded by an in-process file lock, and the banner mutation rate limiter is in-memory — both are per-instance. On a multi-instance deployment they do NOT coordinate across instances (file locks don't span hosts; atomic rename only holds within one filesystem). If scaling past one instance, move campaign index/active state to the database and use a shared store (e.g. Redis) for rate limits.
