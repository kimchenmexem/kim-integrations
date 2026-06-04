# marketing-translator

An internal AI-assisted translation + compliance tool for European financial-marketing copy. Built for MEXEM. Takes English marketing source (banner headlines, ad copy, email subject lines, etc.) and produces locale-faithful translations into seven European locales (`it-IT`, `fr-FR`, `nl-NL`, `nl-BE`, `fr-BE`, `es-ES`, `en-GB`) with rule-bundle compliance checks, version history, audit logging, and reviewer feedback that feeds back into future translations.

> Regulated-financial domain. Not a general-purpose translator. Compliance rules and banned-phrase enforcement are first-class.

---

## What's inside

```
backend/      Express + Prisma + Clerk + OpenAI. Persistent translation state.
frontend/     React (Vite). Sign-in via Clerk. Admin + Reviewer + Translator UIs.
packages/     Shared TypeScript types used by both ends.
prisma/       Schema + migrations (Postgres).
docs/         COMPLIANCE_SOT.md (compliance source-of-truth design).
DEPLOYMENT.md Staging deploy guide for Vercel + Render + Neon + Clerk.
```

### Tools / tabs the user sees

| Surface | Audience | What it does |
|---|---|---|
| Batch Translate | any signed-in user | Translate many lines × many locales in one pass. Per-cell review. |
| Single Translate | any signed-in user | One text → one locale with full options (persona, tone, length). Faithful-mode prompt. |
| Quick Translate | any signed-in user | Text in → translation out, no compliance framing. Fast path. |
| Compliance Check | any signed-in user | Check arbitrary text against a locale's published compliance bundle. |
| Compliance Admin | MANAGER / ADMIN | Sources + obligations + rules + bundles + **Forbidden Phrases** |
| Publisher Admin | MANAGER / ADMIN | Media-planning publishers (advisory, non-compliance) |
| User Management | ADMIN | List users, change role, activate/deactivate. Last-admin protections enforced atomically. |
| Audit Logs | MANAGER / ADMIN | Every sensitive mutation, paginated + filterable. |

### Backend invariants

- **Authentication** Clerk. Every API request carries a Bearer token. `req.authUser` is the local `User` row after Clerk lookup.
- **Authorization** local Prisma `Role` enum (USER / REVIEWER / MANAGER / ADMIN). RBAC + ownership scoping. The first ADMIN is bootstrapped via `INITIAL_ADMIN_EMAILS`; thereafter, roles are managed through the User Management tab.
- **Compliance loop** Reviewer flags a phrase → `ForbiddenPhrase` row → next translation to that locale gets a "NEVER use" instruction in the prompt. Reviewer corrections feed back automatically.
- **Audit** Every mutation through `/api/admin/*` and `/api/compliance/admin/*` writes an `AuditLog` row in the same `prisma.$transaction` as the change. Fail-closed.
- **Versioning** Every change to a `TranslationOutput` (initial generation, review update, future admin override) writes an append-only `TranslationOutputVersion`. Prior states are never lost.
- **Concurrency** Last-active-ADMIN protection serialises via `SELECT … FOR UPDATE` on the active-ADMIN set, proven correct under parallel admin mutations.

---

## Local development

Prereqs: Node 20+, npm 10+, a Postgres reachable via `DATABASE_URL`, and (optionally) Clerk + OpenAI keys.

```bash
git clone https://github.com/kimchenmexem/marketing-translator.git
cd marketing-translator
npm ci

# Configure env
cp .env.example backend/.env
cp frontend/.env.example frontend/.env
# Fill in:
#   backend/.env:  DATABASE_URL, OPENAI_API_KEY, CLERK_SECRET_KEY, CLERK_PUBLISHABLE_KEY
#   frontend/.env: VITE_CLERK_PUBLISHABLE_KEY (same value as CLERK_PUBLISHABLE_KEY)

# Apply migrations
npm run migrate:deploy

# Boot both servers
npm run dev
#   backend  → http://localhost:4000
#   frontend → http://localhost:5173 (Vite proxies /api/* → :4000)
```

If Clerk env vars are unset, the app still boots — sign-in is hidden and any auth-gated route returns 503. Useful for local DB-only work; not useful for testing auth flows.

---

## Deployment

See [`DEPLOYMENT.md`](./DEPLOYMENT.md) for the full staging procedure on Vercel + Render + Neon + Clerk: env vars per host, deploy order, migration command, first-admin bootstrap, smoke-test checklist, rollback.

---

## Scripts reference

```bash
npm run dev                Concurrent dev servers (backend :4000 + frontend :5173)
npm run dev:backend        Backend only
npm run dev:frontend       Frontend only

npm run typecheck          Backend type-check only (tsc --noEmit)
npm run build              Full monorepo build (shared + backend + frontend)
npm run build:backend      Shared + backend only (Render uses this)
npm run build:frontend     Shared + frontend only (Vercel uses this)

npm run migrate:deploy     Apply prisma/migrations to DATABASE_URL (forward-only)
npm run migrate:status     Show applied/pending migrations
npm run prisma:generate    Regenerate Prisma client after schema changes

npm run start:backend      node backend/dist/index.js (production start)
```

---

## License

See [`LICENSE`](./LICENSE).

---

## Status

Built iteratively across ~30 commits on `main` / `staging-deploy`. Each commit ships a single coherent change with a verification step.
