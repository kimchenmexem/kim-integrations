import express from "express";
import cors from "cors";
import { json } from "body-parser";
import { clerkMiddleware } from "@clerk/express";
import { config } from "./config";
import optionsRouter from "./routes/options";
import glossaryRouter from "./routes/glossary";
import memoryRouter from "./routes/memory";
import reviewRouter from "./routes/review";
import translateRouter from "./routes/translate";
import demoRouter from "./routes/demo";
import batchRouter from "./routes/batch";
import complianceRouter from "./routes/compliance";
import complianceAdminRouter from "./routes/compliance-admin";
import publishersRouter from "./routes/publishers";
import quickTranslateRouter from "./routes/quick-translate";
import campaignCopyRouter from "./routes/campaign-copy";
import authRouter from "./routes/auth";
import adminRouter from "./routes/admin";
import campaignRouter from "./routes/campaign";
import { requireAuth, requireRole } from "./middleware/auth";
import { translateLimiter, mutationLimiter } from "./middleware/rateLimit";

const app = express();

// Configure reverse-proxy trust BEFORE any middleware that inspects req.ip.
// When running behind Render / any reverse proxy, TRUST_PROXY must be set
// (typically to "1"); otherwise req.ip reports the proxy, not the client,
// and audit IP capture becomes useless. In local dev TRUST_PROXY is unset
// and Express ignores X-Forwarded-For entirely — correct default.
app.set("trust proxy", config.trustProxy);

app.use(cors({
  origin: config.allowedOrigins,
  credentials: true,
}));
app.use(json({ limit: "1mb" }));

// Clerk populates req.auth() when CLERK_SECRET_KEY and CLERK_PUBLISHABLE_KEY
// are set in env. The SDK reads those directly; we only pass authorizedParties
// here so Clerk refuses JWTs whose `azp` claim doesn't match one of the
// origins we'd accept via CORS (preventing cross-app token replay).
//
// Same source-of-truth rule as CORS: reuse config.allowedOrigins, which is
// ALLOWED_ORIGINS in prod and a dev default of http://localhost:{5173,3000}.
//
// When the keys are not set (dev convenience) we skip mounting entirely so
// the rest of the app still boots.
if (config.clerkEnabled) {
  app.use(
    clerkMiddleware({
      authorizedParties: config.allowedOrigins,
    })
  );
}

app.use("/api/auth", authRouter);
// /api/admin/* — each handler enforces its own role (ADMIN or MANAGER+ADMIN).
// mutationLimiter caps per-user request frequency (defence against
// credential-stuffing-style abuse of admin endpoints).
app.use("/api/admin", mutationLimiter, adminRouter);
// /api/options returns static UI labels (locale codes, text-type names, etc.).
// No business data, no secrets — safe to remain public. See Step 5.5 audit.
app.use("/api/options", optionsRouter);
app.use("/api/glossary", mutationLimiter, glossaryRouter);
app.use("/api/memory", mutationLimiter, memoryRouter);
app.use("/api/review", mutationLimiter, reviewRouter);
// translateLimiter caps OpenAI-burning routes per user.
app.use("/api/translate", translateLimiter, translateRouter);
app.use("/api/demo", translateLimiter, demoRouter);
app.use("/api/batch", translateLimiter, batchRouter);
// All /api/compliance/* endpoints (GET and POST) now require auth: even the
// non-admin reads expose regulatory sources, bundles and sync history that
// are internal business data.
app.use("/api/compliance", requireAuth, complianceRouter);
app.use(
  "/api/compliance/admin",
  requireRole("MANAGER", "ADMIN"),
  mutationLimiter,
  complianceAdminRouter
);
// All /api/publishers/* endpoints now require auth: publisher registry,
// rankings and channel plans are internal media-planning intelligence.
app.use("/api/publishers", requireAuth, publishersRouter);
app.use("/api/translate/quick", translateLimiter, quickTranslateRouter);
// Campaign brief → multi-platform copy. One OpenAI call per request.
app.use("/api/campaign", translateLimiter, campaignRouter);
// /api/campaign-copy — service-to-service endpoint used by ai-campaign-banner.
// Auth: CAMPAIGN_COPY_API_KEY (static Bearer) when set, else Clerk. No DB
// persistence in v1.
app.use("/api/campaign-copy", campaignCopyRouter);

app.get("/api/health", (_req, res) => {
  res.json({ status: "ok" });
});

// Global error handler — prevent stack trace leaks in production
app.use((err: Error, _req: express.Request, res: express.Response, _next: express.NextFunction) => {
  console.error("Unhandled error:", err);
  res.status(500).json({
    error: "Internal server error",
    ...(config.isDev && { message: err.message }),
  });
});

export default app;
