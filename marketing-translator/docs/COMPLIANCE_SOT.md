# Compliance Source-of-Truth — Technical Documentation

> Internal developer guide for the compliance rule bundle system.
> Non-crypto only — regulated investment / trading / financial marketing scope.

---

## Architecture overview

The compliance source-of-truth (SoT) system adds a structured, auditable pipeline between external regulatory publications and the runtime validation logic that checks marketing translations.

```
External sources         Ingestion (offline)           Review workflow          Runtime (live)
─────────────────   →   ─────────────────────   →   ──────────────────   →   ────────────────
EUR-Lex, FCA,           Adapters discover docs        Obligations drafted       BundleLoader
ESMA, AMF, AFM,         → SourceDocument              → reviewed → approved    reads published
FSMA, CNMV,             → SourceDocumentVersion        ComplianceRules          RuleBundle
CySEC, CONSOB           (immutable snapshots)          attached                 ↓
                        → Diff detection               → Bundle compiled       BundleExecutor
                        → SourceSyncRun log            → Bundle published      runs deterministic
                                                       → LegalReviewTask       rules
                        Raw content NEVER               resolved               ↓
                        read at runtime                                        LLM validators
                                                                               use bundle
                                                                               promptContext
                                                                               ↓
                                                                               Fallback to
                                                                               legacy rules
                                                                               if no bundle
```

### Key design principles

1. **Runtime never reads raw source content.** The translation pipeline only reads `RuleBundle` rows where `status = "published"`. `SourceDocumentVersion.rawContent` and `parsedText` are audit-only columns.
2. **Every change is auditable.** Obligations have a state machine, bundles go through compile → review → publish, and `LegalReviewTask` records track who decided what and when.
3. **Graceful fallback.** If no published bundle exists for a locale, the pipeline uses the legacy hardcoded rules in `jurisdictionRules.ts` and `localeRules.ts`. Zero degradation.
4. **Non-crypto.** The `RegulatorySource.scope` field is restricted to investment/trading/financial marketing. No MiCAR, no virtual-asset rules.

---

## Source registry

### What it contains

9 regulatory source families, seeded by `npm --workspace backend run db:seed:sources`:

| Code | Regulator | Jurisdiction | Adapter |
|---|---|---|---|
| EUR_LEX | European Union | EU | `EurLexAdapter` — curated MiFID II / PRIIPs metadata |
| ESMA | European Securities and Markets Authority | EU | `EsmaAdapter` — curated guidelines / Q&As |
| FCA | Financial Conduct Authority | GB | `FcaAdapter` — COBS 4.x handbook provisions |
| AMF | Autorité des Marchés Financiers | FR | `ManualAdapter` |
| AFM | Autoriteit Financiële Markten | NL | `ManualAdapter` |
| FSMA | Financial Services and Markets Authority | BE | `ManualAdapter` |
| CNMV | Comisión Nacional del Mercado de Valores | ES | `ManualAdapter` |
| CySEC | Cyprus Securities and Exchange Commission | CY | `ManualAdapter` |
| CONSOB | Commissione Nazionale per le Società e la Borsa | IT | `ManualAdapter` |

### Source metadata

Each `RegulatorySource` row includes:
- `code` — stable identifier
- `regulator`, `jurisdiction`, `localeScope`
- `sourceType` — REGULATION, DIRECTIVE, GUIDANCE, CIRCULAR, POSITION, HANDBOOK
- `canonicality` — PRIMARY, SECONDARY, ADVISORY
- `parserKey` — forward-looking adapter identifier (e.g. `fca-handbook`)
- `pollCadence` — on_demand, daily, weekly, monthly
- `active` — whether this source participates in syncs

### Files

- Registry seed data: `backend/src/compliance/sources/registry-seed.ts`
- Seed script: `backend/src/scripts/seed-compliance-sources.ts`
- Read routes: `backend/src/routes/compliance.ts` (`GET /api/compliance/sources`)

---

## Syncing

### What "sync" means in this system

A sync is a **discovery and snapshot** operation — not a live import into production rules.

1. An **adapter** (e.g. `EurLexAdapter`) returns `DiscoveredDocument[]` + `DiscoveredVersion[]`.
2. The **orchestrator** upserts `SourceDocument` records and creates immutable `SourceDocumentVersion` snapshots, deduped by SHA-256 `contentHash`.
3. A **SourceSyncRun** is logged with status, counts, duration, and errors.
4. **Diff detection** compares the latest two versions per document (LCS-based line diff).

### V1 adapter behavior — curated/manual ingestion scaffolding

**Important:** V1 adapters do NOT perform live fetching from regulator websites. There are no HTTP requests to external servers. All adapters operate on static, curated, in-code document lists or are no-ops. This is ingestion scaffolding, not live regulator fetching.

| Source | Adapter | V1 behavior |
|---|---|---|
| EUR_LEX | `EurLexAdapter` | Curated metadata only — 4 hardcoded MiFID II / PRIIPs documents with CELEX IDs and canonical URLs. No remote HTTP fetch. |
| ESMA | `EsmaAdapter` | Curated metadata only — 4 hardcoded guidelines/Q&As with URLs. No remote HTTP fetch. |
| FCA | `FcaAdapter` | Curated metadata only — 6 hardcoded COBS 4.x provisions with URLs. No remote HTTP fetch. |
| AMF | `ManualAdapter` | No-op — returns 0 documents. Content via admin API upload only. |
| AFM | `ManualAdapter` | No-op — same. |
| FSMA | `ManualAdapter` | No-op — same. |
| CNMV | `ManualAdapter` | No-op — same. |
| CySEC | `ManualAdapter` | No-op — same. |
| CONSOB | `ManualAdapter` | No-op — same. |

### What "live" means

"Live" means **live detection of source changes** — the sync discovers new or modified documents and creates snapshots. It does NOT mean:
- Auto-applying raw source text to production validation.
- Scraping live web pages at request time.
- Bypassing the review/publish workflow.

A sync result goes into `SourceDocumentVersion` (audit-only table). It only reaches the runtime after a human creates obligations, attaches rules, compiles a bundle, and publishes it.

### Triggering a sync

```bash
# All sources with dedicated adapters (EUR_LEX, FCA, ESMA)
npm --workspace backend run compliance:sync

# Single source
npm --workspace backend run compliance:sync -- --source FCA

# All 9 sources (including manual-only)
npm --workspace backend run compliance:sync -- --all
```

Or via API:
```bash
curl -X POST http://localhost:4000/api/compliance/sync            # all adapters
curl -X POST "http://localhost:4000/api/compliance/sync?source=FCA"  # single
```

### Files

- Adapter interface: `backend/src/compliance/ingestion/types.ts`
- Orchestrator: `backend/src/compliance/ingestion/orchestrator.ts`
- Diff detection: `backend/src/compliance/ingestion/diff.ts`
- Adapters: `backend/src/compliance/ingestion/adapters/`
- CLI: `backend/src/scripts/compliance-sync.ts`

---

## Review and publish workflow

### Obligation lifecycle

```
pending → reviewed → approved → superseded
                   → rejected → pending (re-open)
```

1. **Create** an obligation — auto-creates a `LegalReviewTask` (kind: `obligation_draft`).
2. **Review** — transition to `reviewed`.
3. **Approve** or **Reject** — records the actor and timestamp; resolves the review task.
4. **Attach rules** — `ComplianceRule` records (banned_phrase, regex, required_disclaimer, etc.) linked to the approved obligation.
5. **Compile** a `RuleBundle` draft for a locale + jurisdiction — gathers all approved obligations + enabled rules, builds `RuleBundleContent`, computes sha256 hash.
6. **Publish** — atomic transaction that marks the draft as `published` and supersedes any prior published bundle for the same locale.

### State machine enforcement

Invalid transitions throw at the service layer and return HTTP 409. For example, `approved → pending` is blocked.

### RuleBundle content structure

```typescript
interface RuleBundleContent {
  bannedPhrases: string[];
  regexRules: Array<{ pattern, flags?, message?, severity }>;
  requiredDisclaimers: Array<{ text, triggers? }>;
  promptContext: string;       // curated text for LLM validator prompts
  disclaimers: {
    riskWarning: string;
    pastPerformance: string;
  };
}
```

### Admin API endpoints

All under `/api/compliance/admin`:

| Method | Path | Purpose |
|---|---|---|
| GET/POST/PUT | `/obligations`, `/obligations/:id` | CRUD |
| POST | `/obligations/:id/transition` | State transitions |
| POST/PUT/DELETE | `/rules`, `/rules/:id` | CRUD |
| GET | `/review-tasks` | List tasks |
| POST | `/review-tasks/:id/assign` | Assign to reviewer |
| POST | `/review-tasks/:id/decide` | Record decision |
| POST | `/bundles/compile` | Compile draft from approved obligations |
| POST | `/bundles/:id/publish` | Publish (atomic supersede) |
| GET | `/bundles/:id` | Full bundle detail |
| GET | `/bundles/published/:locale` | Active published bundle for a locale |

### Files

- Obligation service: `backend/src/compliance/obligations/service.ts`
- Rule service: `backend/src/compliance/rules/service.ts`
- Review service: `backend/src/compliance/review/service.ts`
- Bundle compiler: `backend/src/compliance/bundles/compiler.ts`
- Bundle publisher: `backend/src/compliance/bundles/publisher.ts`
- Admin routes: `backend/src/routes/compliance-admin.ts`

---

## Runtime bundle integration

### How the translation pipeline uses bundles

All three translation paths are bundle-aware:

1. **`ai.ts`** (single translate, `/api/translate`) — loads the bundle at the start of `runTranslationJob`. If the bundle has `bannedPhrases`, they replace the legacy `getComplianceForbiddenWords()` list in the translation prompt. Output includes `bundleVersion`, `sourceRefs`, `bundleRuleMatches`.

2. **`decision-layer.ts`** (compliance validation for single translate + demo) — `makeComplianceDecision()` loads the bundle and:
   - Runs `executeBundleRules(text, bundle)` — fast deterministic checks (banned phrases, regex, disclaimer presence).
   - Passes `bundle.content.promptContext` to both LLM validators, so they evaluate against reviewed rules instead of hardcoded ones.
   - If bundle rules detect critical issues but LLMs say SAFE, the bundle verdict escalates (SAFE → NON_COMPLIANT or BORDERLINE).

3. **`routes/batch.ts`** (`/api/batch`) — pre-loads the bundle for each requested locale. Bundle banned phrases are injected into the batch translation prompt. After translation + quality gate, `executeBundleRules` runs on the final text. Output includes `bundleVersion`, `sourceRefs`, `bundleRuleMatches` per locale.

4. **Validation output** — `validation.compliance` (single translate) and per-locale translation objects (batch) now include:
   - `bundleVersion` — e.g. `"en-GB@2.0.0"` (null if no bundle)
   - `sourceRefs` — `[{sourceCode: "FCA", documentRef: "COBS 4.2"}]`
   - `bundleRuleMatches` — deterministic rule hits with evidence

### Fallback behavior

| Condition | Behavior |
|---|---|
| Published bundle exists | Bundle rules + bundle promptContext + bundle banned phrases |
| No published bundle | Legacy `jurisdictionRules.ts` + `localeRules.ts` + `compliance.ts` regex patterns |
| Bundle exists but empty rules | Bundle's promptContext used for LLMs; executor returns 0 matches; effectively same as legacy |
| `COMPLIANCE_BUNDLES_ENABLED=false` | Full bypass — `loadBundle()` returns null for all locales regardless of DB state. Hard kill switch. |

The fallback is unconditional and tested. Translation quality and compliance detection never degrade.

### Kill switch

Set `COMPLIANCE_BUNDLES_ENABLED=false` in the environment. This causes `loadBundle()` to return `null` immediately (before the cache check, before any DB query). All three paths (translate, batch, demo) revert to legacy hardcoded rules. This is a hard bypass, not a cache trick.

### Files

- Bundle loader: `backend/src/compliance/bundles/loader.ts`
- Bundle executor: `backend/src/compliance/engine/executor.ts`
- Integration: `backend/src/services/decision-layer.ts`, `ai.ts`, `jurisdictionRules.ts`, `routes/batch.ts`

---

## What remains manual in V1

| Area | V1 Status | Future |
|---|---|---|
| Full document text | Manual upload for all sources | Real parsers per source family |
| AMF, AFM, FSMA, CNMV, CySEC, CONSOB adapters | `ManualAdapter` (no-op) | Dedicated adapters |
| Obligation creation | Admin API / curl | Admin UI in frontend |
| Bundle creation for all 7 locales | Only en-GB has a published bundle | Seed script for all locales |
| Auth on admin endpoints | None (V1 dev-only) | Auth gate before deployment |
| Scheduled sync | Manual CLI / API call | Cron job or scheduler |
| Snapshot storage | PostgreSQL TEXT column | Object storage (S3/GCS) for large docs |
| Notification on source changes | Console output only | Email/Slack webhook |

---

## Commands reference

```bash
# ─── Setup ────────────────────────────────────────────────────
npm install
npm --workspace backend run prisma:generate
npx prisma migrate dev --schema prisma/schema.prisma

# ─── Seed ─────────────────────────────────────────────────────
npm --workspace backend run db:seed:sources        # 9 regulatory sources

# ─── Sync ─────────────────────────────────────────────────────
npm --workspace backend run compliance:sync                    # dedicated adapters
npm --workspace backend run compliance:sync -- --source FCA    # single source
npm --workspace backend run compliance:sync -- --all           # all 9 sources

# ─── Dev servers ──────────────────────────────────────────────
npm run dev:backend           # http://localhost:4000
npm run dev:frontend          # http://localhost:5173

# ─── Tests ────────────────────────────────────────────────────
npm --workspace backend run test:compliance        # compliance SoT test suite (67 tests)
npm --workspace backend run test:quality-gate      # existing QG tests
```

---

## Production notes

### Database

The application uses **PostgreSQL** via Prisma (`DATABASE_URL` connection string). For local development, the easiest setup is Docker:

```bash
docker run -e POSTGRES_PASSWORD=dev -p 5432:5432 postgres:16-alpine
```

Then run `npx prisma migrate dev` to apply migrations.

Note: `SourceDocumentVersion.rawContent` stores full document text in the database. For production with large regulatory documents, consider moving to object storage (S3/GCS) and storing only a reference key in this column.

### Snapshot storage

`SourceDocumentVersion.rawContent` stores full document text in the database. For production with large regulatory documents (some can be hundreds of pages), this should move to object storage:
- Store a reference/key in the DB column instead of the full text.
- Use S3, GCS, or Azure Blob for the actual content.
- The `parsedText` column (normalised excerpt) can remain in the DB for quick access.

This is a straightforward refactor: the orchestrator's persistence logic is the only writer, and the content is never read at runtime.

### Auth

Admin endpoints (`/api/compliance/admin/*`) have no authentication in V1. Before deployment:
- Add an `X-Admin-Token` header check (minimum viable).
- Or integrate with your existing auth/session system.
- The public read endpoints (`/api/compliance/sources`, `/bundles`) may remain open or be gated per policy.

### Cache invalidation

The `BundleLoader` caches published bundles for 60 seconds (`BUNDLE_CACHE_TTL_MS` env var). The `publishBundle()` function calls `invalidateBundle(localeCode)` immediately after the publish transaction commits, so the runtime picks up the new bundle on the next request — no TTL delay. The cache is a performance optimization for steady-state reads, not a source of staleness after publish.
