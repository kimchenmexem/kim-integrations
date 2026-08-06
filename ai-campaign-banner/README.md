# AI Campaign Banner Generator

MVP that turns a marketing message into rendered banner ads, with a full element manifest and exportable ZIP package.

## Stack

Next.js 16 (App Router) · TypeScript · Tailwind 4 · Zod · Playwright (headless render) · Sharp (compositing) · Supabase · Cloudinary · Bannerbear (optional) · OpenAI / Anthropic (planning) · Google Gemini (Nano Banana, experimental) · JSZip

## Getting started

### 1. Create your local env file

`.env.example` is the committed template — it lists every variable the app reads, with empty values. Your real keys live in `.env.local`, which is git-ignored (see [`.gitignore`](./.gitignore)) so secrets never end up in version control.

From the project root:

```bash
cp .env.example .env.local
```

Then open `.env.local` and fill in each value:

| Variable | Where to get it |
|---|---|
| `AI_PROVIDER` | Set to `openai` or `anthropic` to pick which model the planner uses. |
| `OPENAI_API_KEY` | <https://platform.openai.com/api-keys> |
| `ANTHROPIC_API_KEY` | <https://console.anthropic.com/settings/keys> |
| `NEXT_PUBLIC_SUPABASE_URL` | Supabase project → Settings → API → Project URL |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Supabase project → Settings → API → `anon` `public` key |
| `SUPABASE_SERVICE_ROLE_KEY` | Supabase project → Settings → API → `service_role` key (server-only — never expose to the browser) |
| `CLOUDINARY_CLOUD_NAME` / `CLOUDINARY_API_KEY` / `CLOUDINARY_API_SECRET` | Cloudinary dashboard → Account Details |
| `BANNERBEAR_API_KEY` | Bannerbear → Project → Settings → API key |
| `BANNERBEAR_TEMPLATE_1200x628` / `_1080x1080` / `_1080x1920` | Bannerbear → Templates → copy each template's UID. Create one template per size. |
| `MARKETING_TRANSLATOR_API_URL` / `MARKETING_TRANSLATOR_API_KEY` | The translator service URL + a shared token matching its `CAMPAIGN_COPY_API_KEY`. Required to generate real campaigns (copy comes from the translator, not locally). |
| `BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD` | Optional app-wide Basic Auth gate for the deployed service. |
| `BANNER_INTERNAL_API_KEY` | Server-only key required (in production) on mutation/cost `/api/*` routes. `openssl rand -hex 32`. See "Security & API auth". |
| `ALLOW_UNAUTHENTICATED_DEV_API` | Local dev only — set `true` to let the local UI call mutation routes without credentials. |
| `AI_IMAGE_PROVIDER` | Optional. `none` (default) = no paid image generation; `openai` = generate backgrounds via OpenAI Images. |
| `GEMINI_API_KEY` | Optional — only for the experimental `/nano-banana` route. |

Only fill in the provider you selected with `AI_PROVIDER` — the other can stay empty. Image generation is **off by default**.

### 2. Install and run

```bash
npm install
npm run dev
```

Open <http://localhost:3000>.

> **Never commit `.env.local`.** If you accidentally stage it, `git restore --staged .env.local` and double-check `git status` before pushing.

## Project layout

```
src/
  app/                       # App Router pages + API route handlers
    page.tsx                 # home
    campaigns/               # list + [id] detail
    assets/                  # uploaded asset library
    settings/                # brand kit, AI provider, template map
    api/
      generate-campaign/     # POST: create campaign plan (AI planning + translator copy)
      render-campaign/       # POST: render a campaign's ads via headless Chromium (Playwright)
      render-ad/             # POST: render one ad (code renderer; Bannerbear optional)
      generate-nano-banner/  # POST: standalone Gemini "Nano Banana" creative (experimental)
      upload-asset/          # POST: upload to Cloudinary
      export-campaign-zip/   # POST: build ZIP package (also export-campaign-svg / -ad-svg)
      qa/ · qa-campaign/     # POST: run deterministic QA
  middleware.ts              # Basic Auth gate + internal-key guard for mutation/cost routes
  lib/
    ai/                      # provider abstraction, planner, midjourney pack
    bannerbear/              # client, render, template map
    cloudinary/              # client, upload, folder helpers
    supabase/                # browser + server clients, queries
    export/                  # ZIP builder, manifest files
    qa/                      # deterministic QA checks
    schemas/                 # Zod schemas (single source of truth)
data/                        # example brand kit + Bannerbear template map
docs/                        # ARCHITECTURE.md, ASSUMPTIONS.md
```

## Conventions

- **All AI output is validated with Zod before use.** Raw model output never touches storage.
- **External clients are lazily initialized** from env vars — the app boots even with empty `.env.local`, but calls fail fast.
- **No keys in code.** See [`.env.example`](./.env.example).
- **Server-only modules** (`src/lib/supabase/server.ts`, `src/lib/supabase/queries.ts`) import `"server-only"` to keep service-role secrets out of the browser bundle.
- **Midjourney is manual.** The app emits prompt packs; humans run them and upload finished assets via the Assets page.

## Status

The pipeline is implemented and working end-to-end — this is **no longer a skeleton**, and route handlers do real work (they do not return 501). The four moving parts:

- **Deterministic manifest / render pipeline.** Every ad is described by an Element Manifest (typed JSON, the single source of truth). Backgrounds, motifs, patterns and CTAs are generated as SVG; the renderer loads the `/render/ad/[adId]` page and captures a flat PNG via headless Chromium (Playwright). The AI never chooses layout coordinates — only copy/strategy/visual intent.
- **AI planning / copy generation.** `AI_PROVIDER` (`openai` | `anthropic` | `mock`, default `mock`) writes concept strategy + visual direction. The planner then **overwrites every copy field** (headline / subheadline / cta / disclaimer) with marketing-translator output — the banner does not author marketing copy itself.
- **Translator integration (fail-closed).** The planner calls marketing-translator `POST /api/campaign-copy/batch`. If the translator returns a non-2xx (including a **422 `compliance_failed`**), the planner treats it as a hard failure and does **not** build or render a manifest with unsafe copy. See "Compliance" below.
- **Nano Banana / Gemini (experimental).** `/nano-banana` + `POST /api/generate-nano-banner` is a standalone Gemini-image creative path, isolated from the deterministic campaign pipeline. Requires `GEMINI_API_KEY`. Midjourney is manual (the app emits prompt packs; humans run them and upload results).

See `docs/ARCHITECTURE.md` and `docs/SYSTEM_OVERVIEW.md` for the full pipeline.

## Security & API auth

Two server-only layers, both enforced in `src/middleware.ts` (never shipped to the browser — no secret is exposed to clients). See `.env.example` for the variables.

- **Basic Auth** (`BASIC_AUTH_USER` / `BASIC_AUTH_PASSWORD`) fronts the whole app. The browser prompts once and resends cached credentials on same-origin fetch, so the UI keeps working. No-op when unset (local dev).
- **Internal API key** (`BANNER_INTERNAL_API_KEY`) protects every **mutation / cost** `/api/*` route (campaign generation, rendering, exports, uploads, generators, QA, active-campaign/index mutation). Present it as `Authorization: Bearer <key>` or `x-internal-api-key: <key>`. The authenticated browser UI is allowed through via Basic Auth, so the key never needs to live in client code.
  - **Production fails closed:** if *neither* the internal key *nor* Basic Auth is configured, mutation routes return `503`. Missing credentials → `401`; invalid → `403`; rate limited → `429`.
  - **Local dev:** set `ALLOW_UNAUTHENTICATED_DEV_API=true` to let the local UI call mutation routes without credentials. Never set this in production.
  - GET reads (`/api/brand-kit`, `/api/generators/registry`, …) stay public behind Basic Auth only.
  - A simple in-memory, per-identity rate limiter caps mutation routes (`BANNER_API_RATE_LIMIT_PER_MIN`, default 60). **Per-instance only** — on multi-instance deployments the effective limit is `max × instances`; replace with Redis for a hard cross-instance quota.

## Supported locales

The banner's output languages are exactly the locales marketing-translator can produce compliant copy for (BCP-47):

`en-GB · fr-FR · fr-BE · it-IT · nl-NL · nl-BE · es-ES`

Legacy 2-letter codes are coerced on input (`en→en-GB`, `fr→fr-FR`, `it→it-IT`, `nl→nl-NL`) so old data keeps loading. **Arabic (`ar`) and Hebrew (`he`) are rejected** at schema validation — a cheap `400` before any AI spend — because the translator has no compliant pipeline for them yet. To add a locale, extend `LANGUAGES`/`LANG_META` in `src/lib/i18n/language.ts` **and** the translator's `SUPPORTED_LOCALES`.

## Compliance (fail-closed)

marketing-translator is the sole authority for marketing copy *and* its compliance. `/api/campaign-copy` runs every generated field through the dual-validator decision layer and returns `422 compliance_failed` (with structured `blockedFields`) when any field is blocked or escalated to human review. The banner's translator client surfaces that as a hard error, so unsafe copy can never reach a rendered/exported banner. Deterministic QA additionally verifies `copy_source === "marketing-translator"`, but that is a provenance check, not the compliance gate.

## Determinism

- **Persisted manifest + same assets + same renderer version → deterministic render.** Re-rendering a saved campaign produces the same pixels.
- **Same input request does NOT guarantee the same campaign id/output.** Each generation mints a fresh `campaign_id` (and non-`mock` providers are non-deterministic by nature). There is no request-level idempotency key today — resubmitting a brief creates a new campaign. If you need idempotency, add an explicit key; it was intentionally left out as it doesn't fit cleanly yet.
- Campaign index (`data/campaigns/index.generated.json`) and the active pointer (`data/active-campaign.generated.json`) are written **atomically (temp-file + rename) under a file lock** so concurrent generations don't corrupt or lose entries. These locks are single-instance only (see `src/lib/storage/atomicJson.ts`); move this state to a database if scaling past one instance.

## Scripts

| | |
|---|---|
| `npm run dev` | start dev server |
| `npm run build` | production build (also runs typegen) |
| `npm run start` | run the production build |
| `npm run lint` | ESLint |
| `npm run typecheck` | `tsc --noEmit` type check |
| `npm run test` | run all fast tests: zones + provider retry + locale contract + API guard |
| `npm run test:provider` | provider JSON/schema retry unit test (Task 6) |
| `npm run test:locale` | locale contract + translator-client 422 fail-closed test (Task 2) |
| `npm run test:api-guard` | mutation-route auth guard test (Task 1) |
| `npm run brand:intake` | validate `brand-spec.json` + scan `brand-input/`, write `data/brand-kit-lite.generated.json` and `data/asset-import-plan.generated.json` |
| `npm run preview:assets` | copy brand-input images to `public/brand-input-preview/` and write `data/asset-preview-map.generated.json` |
| `npm run preview:mockups` | composite tagged screenshots into device mockups (Sharp) and write `data/mockup-composite-map.generated.json` |
| `npm run preview:demo` | build `data/demo-campaign.preview.json` from the brand kit + composites |
| `npm run preview:all` | run all four `preview:*` steps + intake in order |
| `npm run cloudinary:check` | validate `.env.local` Cloudinary creds + ping the API (no uploads) |
| `npm run cloudinary:upload-assets` | upload `brand-input/*` images via the asset import plan |
| `npm run cloudinary:upload-composites` | upload `public/generated-preview-composites/*.png` |
| `npm run cloudinary:upload-all` | both upload scripts in order |
| `npm run bannerbear:check` | verify Bannerbear creds + template layer contract (no renders) |
| `npm run bannerbear:sync-templates` | snapshot template metadata to `data/bannerbear-template-snapshots.generated.json` |
| `npm run bannerbear:render-demo` | render the 3 demo ads through Bannerbear |
| `npm run render:code-demo` | render the 3 demo ads via headless Chromium → `public/rendered-ads/demo/*.png` |
| `npm run render:code-all` | full chain: `preview:all` + `render:code-demo` |
| `npm run cloudinary:upload-code-renders` | push final PNGs to Cloudinary (`brands/{brand_id}/final-renders/`) |
| `npm run midjourney:prompts` | generate `data/midjourney-prompt-pack.generated.json` (no Midjourney API call) |
| `npm run midjourney:reference-pack` | classify brand assets + pick per-prompt references + copy to `public/midjourney-reference-pack/` |
| `npm run midjourney:list-uploads` | print Midjourney upload + assignment summary (read-only) |
| `npm run campaign:generate-mock` | run the AI Campaign Planner with `AI_PROVIDER=mock`, save to `data/campaigns/{id}/`, set as active |
| `npm run campaign:list` | list every saved campaign with active (★) and rendered (✓) markers |
| `npm run render:code-campaign` | render the active campaign (or `--campaign-id=...`) → `public/rendered-ads/campaigns/{id}/` (falls back to demo render when no campaign is active) |

## Local visual preview

A browser-only preview pipeline lets you see contextual mockup composites before any production renderer is wired. Run:

```bash
npm run preview:all
npm run dev
```

Then open:

- **<http://localhost:3000/visual-preview>** — three contextual ad previews (1200×628, 1080×1080, 1080×1920) with full Element Manifests and visual-selection metadata.
- **<http://localhost:3000/screenshot-tagger>** — assign each platform screenshot a campaign context (stocks / etfs / charts / green_data / general_platform). Saves to `brand-input/Platform screenshot/screenshot-tags.json`.
- **<http://localhost:3000/mockup-calibrator>** — draw the screen rectangle inside each device mockup. Saves to `brand-input/mockup devices/mockup-manifest.json`.

After tagging or calibrating, re-run `npm run preview:mockups && npm run preview:demo` (or `npm run preview:all`) and refresh `/visual-preview`.

See [docs/SCREENSHOT_TAGGING_AND_MOCKUP_CALIBRATION.md](./docs/SCREENSHOT_TAGGING_AND_MOCKUP_CALIBRATION.md) for the full workflow.

## Cloudinary Upload Stage

Once the local visual preview looks right, push the brand assets and composites to Cloudinary so production renderers (Bannerbear later) have stable URLs:

```bash
# 1. Verify credentials (no upload):
npm run cloudinary:check

# 2. Upload everything:
npm run cloudinary:upload-all

# 3. Regenerate the demo so it consumes Cloudinary URLs:
npm run preview:demo

# 4. Open the preview:
npm run dev    # if not already running
open http://localhost:3000/visual-preview
```

Every image element in the demo now carries `delivery_source: "cloudinary"`, `cloudinary_public_id`, and the Cloudinary `secure_url` in `file_url`. The original `local_public_path` is preserved so the same manifest still resolves locally.

See [docs/CLOUDINARY_UPLOAD_WORKFLOW.md](./docs/CLOUDINARY_UPLOAD_WORKFLOW.md) for details — destination folder layout, idempotency, redaction, and what to do when public_ids change.

## Bannerbear Rendering Stage

Once Cloudinary has the assets and `/visual-preview` looks right, render the demo ads through Bannerbear:

```bash
# 1. Verify creds + that each template has the required layers (no render):
npm run bannerbear:check

# 2. Snapshot what Bannerbear says about each template:
npm run bannerbear:sync-templates

# 3. Render all 3 demo ads:
npm run bannerbear:render-demo

# 4. View the side-by-side comparison:
npm run dev   # if not already running
open http://localhost:3000/bannerbear-preview
```

Each rendered ad's record in `data/bannerbear-render-map.generated.json` carries the modifications sent, the conversion diagnostics, the verbatim Bannerbear response, the final image URL, and a redacted error string on failure. See [docs/BANNERBEAR_RENDER_WORKFLOW.md](./docs/BANNERBEAR_RENDER_WORKFLOW.md) for the full layer contract and template setup checklist.

## Code-Based Renderer Stage

Production renderer for the MVP — works without Bannerbear template setup. Reads the Element Manifest, renders it as positioned HTML/CSS at exact canvas size, and captures a flat PNG via headless Chromium.

```bash
# 1. Have a dev server running:
npm run dev   # if not already

# 2. Capture the 3 demo ads:
npm run render:code-demo
# → public/rendered-ads/demo/{1200x628,1080x1080,1080x1920}.png
# → data/code-render-map.generated.json

# 3. (optional) Upload the final PNGs to Cloudinary:
npm run cloudinary:upload-code-renders

# 4. View the comparison:
open http://localhost:3000/code-render-preview
```

The dev server defaults to port 3000; if you're already running on another port, pass `RENDER_BASE_URL=http://localhost:3001` (or `--base-url=...`) when invoking `render:code-demo`.

Bannerbear remains optional and supported — see [/bannerbear-preview](http://localhost:3000/bannerbear-preview) and `npm run bannerbear:render-demo`. The code renderer is the default for the MVP. Both renderers read the same Element Manifest. See [docs/CODE_RENDERER_WORKFLOW.md](./docs/CODE_RENDERER_WORKFLOW.md) for the architecture rules and the resolver priority used by the future ZIP exporter.

## Midjourney Manual Workflow

Midjourney is a **manual** human-in-the-loop creative workflow. The system never calls Midjourney; it generates prompt packs, the human runs them, and selected outputs are uploaded back into the app where they become regular image elements with full provenance.

```bash
# 1. Generate the prompt pack (no Midjourney API call):
npm run midjourney:prompts

# 2. Build the reference pack — classifies brand assets for safety and copies
#    per-prompt style references to public/midjourney-reference-pack/:
npm run midjourney:reference-pack

# 3. Open the workflow page:
npm run dev   # if not already running
open http://localhost:3000/midjourney

# 4. For each prompt: copy → drag the recommended references into Midjourney
#    as style refs → run → download → upload via the form. Approve uploads
#    you want to use in the demo.

# 5. Re-run the demo so approved uploads land on the manifest:
npm run preview:demo

# 6. Render the final PNGs:
npm run render:code-demo
```

Approved uploads emit elements with `source: "midjourney_manual_upload"` and a `midjourney` provenance block (prompt_id, upload_id, intended_use, context, approved). Backgrounds replace the brand-input background; up to two decoratives appear as corner accents; the mockup composite stays the primary product visual. See [docs/MIDJOURNEY_MANUAL_WORKFLOW.md](./docs/MIDJOURNEY_MANUAL_WORKFLOW.md) for what Midjourney is allowed/forbidden to generate and the full element-mapping rules.

The reference-pack classifier ensures Midjourney only ever sees safe inputs: it labels brand logos / IBKR logos / mockups / platform screenshots as **avoid**, while backgrounds and clean decoratives become **style references**. Per-prompt picks land in `public/midjourney-reference-pack/<prompt_id>/` for drag-and-drop into Midjourney. See [docs/MIDJOURNEY_REFERENCE_PACK_WORKFLOW.md](./docs/MIDJOURNEY_REFERENCE_PACK_WORKFLOW.md) for the full classification rules.

### Using Midjourney Outputs

After uploading + approving a Midjourney result on `/midjourney`, you can either:

- **Let it default-route.** The demo picks the first approved background / decorative / hero by `intended_use`. Just run `npm run preview:demo`.
- **Assign explicitly.** On the upload card, pick a slot (e.g. *Background — 1080×1080* or *Decorative_1 — all formats*) and click **Assign**. The next `npm run preview:demo` honors the assignment for that specific (format, role) pairing.

Diagnostics:

```bash
npm run midjourney:list-uploads
```

Every Midjourney-source element on the manifest carries a `provenance` block (`generated_by: "midjourney"`, `uploaded_by_user: true`, `manual_workflow: true`) plus the assignment_id + target_element_role when an explicit assignment was used. See [docs/MIDJOURNEY_MANUAL_WORKFLOW.md](./docs/MIDJOURNEY_MANUAL_WORKFLOW.md#assigning-uploads-to-specific-slots) for the full assignment + provenance contract.

## AI Campaign Planner Stage

Replaces the hardcoded demo with an AI-driven campaign planner. The operator submits a brief; the AI proposes concepts (strategy, copy, visual direction, Midjourney prompt packs); the system constructs the per-format Element Manifests deterministically. The Element Manifest stays the source of truth — the AI never decides layouts or coordinates.

```bash
# 1. Generate a campaign with the deterministic mock provider (no API key required):
npm run campaign:generate-mock
# → data/campaigns/{campaign_id}/campaign-plan.json
# → data/campaigns/index.generated.json   (upserted)
# → data/active-campaign.generated.json   (active pointer)

# 2. List campaigns:
npm run campaign:list

# 3. Render the active campaign as PNGs:
npm run dev   # if not already running
RENDER_BASE_URL=http://localhost:3000 npm run render:code-campaign
# → public/rendered-ads/campaigns/{campaign_id}/{concept_id}_{format}.png
# → data/campaigns/{campaign_id}/code-render-map.generated.json

# 4. Review in the UI:
open http://localhost:3000/campaign-planner   # operator form (POSTs /api/generate-campaign)
open http://localhost:3000/campaigns           # list of saved plans
open http://localhost:3000/visual-preview      # active campaign in HTML/CSS
open http://localhost:3000/code-render-preview # active campaign side-by-side with rendered PNGs
```

Architecture:
- The AI returns concept stubs (`AICampaignPlanRaw`): names, strategy, copy, target emotion, visual direction, per-concept Midjourney prompts.
- The system runs the existing demo machinery (`pickAssets`, `pickVisualForSpec`, `buildAdSpec`) to construct Element Manifests for every (concept × format) — 1200×628, 1080×1080, 1080×1920.
- All AI output is Zod-validated immediately after the model call. Schema failures are rejected with redacted error messages (`Bearer …`, `api_key=…`, `sk-…` are stripped).
- Three providers via `AI_PROVIDER`: `mock` (default, deterministic, no network), `openai` (requires `OPENAI_API_KEY`), `anthropic` (requires `ANTHROPIC_API_KEY`).
- The demo flow is untouched: with no active campaign, `/visual-preview` and `/code-render-preview` fall back to `data/demo-campaign.preview.json` and the existing render scripts keep working.

See [docs/AI_CAMPAIGN_PLANNER_WORKFLOW.md](./docs/AI_CAMPAIGN_PLANNER_WORKFLOW.md) for the full schema layering, what the AI is and is not allowed to decide, and the verification steps.
