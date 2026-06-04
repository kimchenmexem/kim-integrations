# Deployment — staging and production

A single-page operational guide to deploying `marketing-translator` to a real environment. Optimised for the target stack:

- **Frontend** — Vercel
- **Backend** — Render web service
- **Database** — Neon or Render Managed PostgreSQL
- **Auth** — Clerk

Every piece is reasonably portable — the only vendor-specific detail is the `TRUST_PROXY` value (see below).

---

## 1. Services required

| Service | Notes |
|---|---|
| PostgreSQL 14+ | Neon free tier or Render managed Postgres both work. Must expose a standard `postgresql://` connection string. |
| Clerk application | One Clerk application per environment (staging, prod). Never share keys across environments. |
| Frontend host | Vercel project pointing at the repo's `frontend/` workspace. |
| Backend host | Render web service pointing at the repo's `backend/` workspace. |

---

## 2. Env vars, by service

### 2.1 Backend (Render)

| Var | Required | Purpose |
|---|---|---|
| `DATABASE_URL` | **always** | PostgreSQL connection string (e.g. `postgresql://user:pass@host:5432/db?sslmode=require`). |
| `OPENAI_API_KEY` | **always** | Used by every translate / quality-gate / compliance-check call. |
| `NODE_ENV` | always | Set to `production` in staging and production. Enables strict config validation (`CLERK_*` and `ALLOWED_ORIGINS` become hard-required). |
| `PORT` | yes on Render | Render sets `PORT` automatically; the app reads it. |
| `CLERK_SECRET_KEY` | **PROD required** | `sk_test_…` (staging) or `sk_live_…` (prod). |
| `CLERK_PUBLISHABLE_KEY` | **PROD required** | `pk_test_…` / `pk_live_…`. Must be the same value as the frontend's `VITE_CLERK_PUBLISHABLE_KEY`. |
| `ALLOWED_ORIGINS` | **PROD required** | Comma-separated frontend origin(s), no trailing slash. Drives both CORS **and** Clerk `authorizedParties`. Example: `https://app-staging.vercel.app,https://app-staging.example.com`. |
| `TRUST_PROXY` | yes on Render | Set to `1` — Render fronts your service with its own proxy layer. Required for `req.ip` / audit IP capture. |
| `INITIAL_ADMIN_EMAILS` | one-shot | Comma-separated emails. Only consulted on **first local-user creation**; after bootstrap, remove it. See §5. |
| `ADMIN_TOKEN` | **deprecated** | Not consulted by any live route. Leave unset. |

Optional tuning vars (`QG_*`, `SEMANTIC_WEIGHT`, `LOW_RISK_THRESHOLD`, …) have safe defaults and can be left unset.

### 2.2 Frontend (Vercel)

| Var | Required | Purpose |
|---|---|---|
| `VITE_CLERK_PUBLISHABLE_KEY` | **PROD required** | Same value as the backend's `CLERK_PUBLISHABLE_KEY`. |
| `VITE_API_BASE_URL` | **PROD required** | Full scheme+host of the backend, no trailing slash. Example: `https://marketing-translator-api.onrender.com`. Without this, the production frontend calls its own Vercel origin for `/api/*` and every request 404s. |

Old `VITE_ADMIN_TOKEN` is **removed** — delete it from any environment that still has it.

### 2.3 Clerk application

In the Clerk dashboard for this environment:
- Add the Vercel frontend origin to **Allowed origins** / **CORS origins**.
- The **Publishable key** and **Secret key** must be copied verbatim into Vercel and Render respectively (§2.1, §2.2).

---

## 3. Deploy order

Run these steps top-to-bottom the first time; after that, only the parts you actually changed.

```
1. Provision Postgres (Neon or Render Postgres).
   → Capture the DATABASE_URL (ensure `?sslmode=require` if the provider requires it).

2. Create the Clerk application.
   → Capture CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY.
   → Add the planned frontend origin to Clerk's Allowed Origins.

3. Create the Render backend service.
   → Root directory: /
   → Build command:   npm ci && npm run build:backend && npm run migrate:deploy
   → Start command:   npm run start:backend
   → Env vars: see §2.1. Include INITIAL_ADMIN_EMAILS on first deploy only.
   → Health check path: /api/health

4. Create the Vercel frontend project.
   → Root directory: frontend
   → Build command:   npm --prefix .. ci && npm --prefix .. run build:frontend
   → Output directory: dist
   → Env vars: see §2.2.

5. Trigger deploys in this order:
   a. Render backend (runs migrate:deploy, starts serving).
   b. Vercel frontend.

6. Smoke-test — §6.
```

Subsequent deploys: push to `main` (or the staging branch). Render and Vercel both auto-deploy. `migrate:deploy` runs every Render build and is a no-op when the DB is up-to-date.

---

## 4. Commands (for running anything manually)

From the repo root:

```bash
npm ci                    # install all three workspaces
npm run build             # shared + backend + frontend
npm run build:backend     # shared + backend only (Render)
npm run build:frontend    # shared + frontend only (Vercel)
npm run typecheck         # backend-only: tsc --noEmit against backend/tsconfig.json.
                          # Does NOT typecheck packages/shared or frontend; use
                          # `npm run build` for a full monorepo type check.
npm run migrate:deploy    # applies prisma/migrations/* to DATABASE_URL
npm run migrate:status    # shows pending / applied migrations
npm run start:backend     # node backend/dist/index.js
npm run dev               # concurrent dev servers (backend :4000, frontend :5173)
```

`npm run migrate:deploy` is the safe-for-production variant of Prisma migrations — it never prompts, never generates, never resets; it only applies already-reviewed SQL files from `prisma/migrations/`.

---

## 5. First-admin bootstrap

The backend promotes a fresh local user to `ADMIN` on their first sign-in **iff** their verified Clerk email matches an entry in `INITIAL_ADMIN_EMAILS` (see `backend/src/services/users.ts`). This is the only way to bootstrap an admin on an empty database.

**How to use it**

1. In the Render backend env, set `INITIAL_ADMIN_EMAILS` to the email you will sign in as (comma-separated for multiple). Redeploy.
2. Have that person sign up through Clerk on the frontend. They must use the same email, and it must be marked verified in Clerk.
3. Their first successful call to `/api/auth/me` creates the local `User` row with `role=ADMIN` and `isActive=true`.
4. Verify: either (a) sign in as that user — the "User Management" and "Audit Logs" tabs should appear in the sidebar, or (b) `SELECT id, email, role, isActive FROM "User";` against the DB.
5. **Remove `INITIAL_ADMIN_EMAILS`** from Render env vars and redeploy. The variable is idempotent (it only fires on fresh user creation), but removing it closes the "anyone whose Clerk email happens to match can become ADMIN" footprint.

**If the first admin already exists**
- `INITIAL_ADMIN_EMAILS` does nothing — it never flips an existing user's role.
- Promote/demote additional users via the Admin UI (`User Management` tab) or via SQL:
  `UPDATE "User" SET role='ADMIN' WHERE email='you@example.com';`

**Safety** — once any admin exists, the last-active-admin guard (see `backend/src/routes/admin.ts` + Step 8.1 row-locking) prevents accidental total lockout even under concurrent mutations.

---

## 6. Smoke-test checklist

Run through this in the order given. Two passes: a quick auth / API-reachability smoke, then a full persisted-flow pass that exercises ownership, history, and audit.

### 6a. Fast auth / API smoke (uses ephemeral routes only)

`POST /api/translate/quick` is stateless — it returns translated text and **does not** persist any `TranslationJob`, `TranslationOutput`, `TranslationMemoryEntry`, `TranslationReview`, `TranslationOutputVersion`, or `translate.create` audit row. Use it here purely as a cheap proof that auth + OpenAI + CORS are all wired correctly.

- [ ] `GET https://<backend-host>/api/health` → `{"status":"ok"}`, HTTP 200.
- [ ] Open the frontend — the page renders, no console errors, no network 404s on `/api/*`.
- [ ] Click **Sign in**. The Clerk modal opens; sign in completes successfully.
- [ ] After sign-in, `GET /api/auth/me` in the Network panel returns 200 with your expected email and role.
- [ ] **First-admin bootstrap** — if `INITIAL_ADMIN_EMAILS` was set, your `/api/auth/me` response shows `role: "ADMIN"`. If not, `role: "USER"`.
- [ ] Sidebar visibility matches role: USER sees no Admin section; ADMIN sees User Management + Audit Logs.
- [ ] As a USER, directly hit `GET /api/admin/users` → 403 `Insufficient role.` (confirms backend gates are not frontend-only).
- [ ] As ADMIN, open **User Management** → the users table loads.
- [ ] In the **Quick Translate** tab, translate any short string → response 200, translated text returned. Expect **no** new rows in `TranslationJob` and **no** `translate.create` audit row — this route is ephemeral. This check only proves auth + OpenAI + CORS are wired.

### 6b. Persisted-flow pass (uses the real /api/translate route)

Use the **Single Translate** tab in the UI (or `POST /api/translate` via curl). That route is the one that actually persists a `TranslationJob` + `TranslationOutput` + v1 `TranslationOutputVersion`, and writes a `translate.create` audit row.

- [ ] As a USER, submit a translation via **Single Translate** → response 200 with a `jobId` in the body. Record that `jobId`.
- [ ] As the creator, `GET /api/translate/:jobId` returns 200 with the job and its outputs.
- [ ] Sign in as a *different* USER and `GET /api/translate/:jobId` → **404** (ownership isolation; same-response-for-missing-or-forbidden).
- [ ] Sign in as a REVIEWER / MANAGER and repeat — they see the job (role-based read override).
- [ ] Submit a review for one of the outputs → after submit, `GET /api/review/:outputId/history` returns two versions: v1 `initial_generation`, v2 `review_update`.
- [ ] Open **Audit Logs** (ADMIN or MANAGER) → recent rows include `translate.create` (from step above), `review.approve`, any admin mutations you perform next. IP addresses resolve to real client IPs (not `127.0.0.1` — proof `TRUST_PROXY=1` took effect).
- [ ] In **User Management**, promote a test USER to REVIEWER → row updates, an audit row `user.role_change` appears.
- [ ] Try to deactivate your own ADMIN → 409 `Cannot deactivate yourself.`
- [ ] With only one active ADMIN left, try to demote that ADMIN → 409 `Cannot demote the last active ADMIN.`

Anything failing in either pass is a blocker; do not cut staging over to shared testing until all pass.

---

## 7. Rollback

- **Bad frontend deploy** — Vercel → Deployments → previous build → Promote to Production. No DB side effects.
- **Bad backend deploy** — Render → Events → previous deploy → Redeploy. Same story; safe because `migrate:deploy` runs forward-only and every migration in this repo has been additive.
- **Bad migration** — Prisma migrations are forward-only. If a migration produced a wrong shape, write a new migration that corrects it and redeploy. Do **not** `prisma migrate reset` against a real database.
- **Compromised Clerk keys** — rotate the Clerk secret in the dashboard, update `CLERK_SECRET_KEY` on Render; the publishable key can be rotated next deploy.

---

## 8. What this doc intentionally does not cover

- Production observability (log aggregation, alerting) — set these up via your Render/Vercel provider.
- Blue-green or canary deploys — not needed at this scale.
- Backup strategy — use Neon/Render's managed-Postgres snapshot features; not in app scope.
