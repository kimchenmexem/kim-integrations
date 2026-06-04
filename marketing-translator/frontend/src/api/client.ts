import axios from "axios";
import { TranslationRequest, GlossaryTermCreate, ReviewRequest } from "@mexem/shared";

/**
 * Resolve the backend base URL.
 *   - VITE_API_BASE_URL set (production: Vercel frontend → Render backend) →
 *     use it verbatim, e.g. "https://api.staging.example.com".
 *   - Not set (local dev) → use same-origin ("") so requests hit the Vite
 *     dev-server proxy which forwards /api/* to http://localhost:4000.
 *
 * Trailing slashes are stripped so route paths stay clean.
 */
const rawBaseUrl = (import.meta.env.VITE_API_BASE_URL as string | undefined) ?? "";
const API_BASE_URL = rawBaseUrl.replace(/\/$/, "");

const api = axios.create({
  baseURL: API_BASE_URL,
  timeout: 30000,
  headers: {
    "Content-Type": "application/json",
  },
});

/**
 * Bridge between React-scoped Clerk hooks and the module-level axios client.
 * <AuthTokenBridge /> (mounted under <ClerkProvider>) calls setAuthTokenProvider
 * with Clerk's supported `useAuth().getToken`. The axios interceptor then
 * asks this ref for a token on every outgoing request.
 *
 * When Clerk is not configured, the bridge never registers a provider and
 * requests go out unauthenticated — public endpoints continue to work.
 */
type TokenProvider = () => Promise<string | null>;
let tokenProvider: TokenProvider | null = null;

export function setAuthTokenProvider(fn: TokenProvider | null) {
  tokenProvider = fn;
}

api.interceptors.request.use(async (config) => {
  if (tokenProvider) {
    const token = await tokenProvider();
    if (token) {
      config.headers.set("Authorization", `Bearer ${token}`);
    }
  }
  return config;
});

export { api };

// ─── Admin ──────────────────────────────────────────────────────────
// All of these call /api/admin/* — backend enforces role (ADMIN, except
// listAuditLogs which also allows MANAGER). Frontend hides the UI for
// non-admin users, but it's strictly a UX concern; the backend is
// authoritative.

export type AdminUser = {
  id: number;
  email: string;
  fullName: string | null;
  role: "USER" | "REVIEWER" | "MANAGER" | "ADMIN";
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
  identities: Array<{ provider: string; providerUserId: string; createdAt: string }>;
};

export async function listAdminUsers() {
  const { data } = await api.get("/api/admin/users");
  return data.users as AdminUser[];
}

export async function updateUserRole(id: number, role: AdminUser["role"]) {
  const { data } = await api.patch(`/api/admin/users/${id}/role`, { role });
  return data.user as AdminUser;
}

export async function updateUserActive(id: number, isActive: boolean) {
  const { data } = await api.patch(`/api/admin/users/${id}/active`, { isActive });
  return data.user as AdminUser;
}

export type AuditLogRow = {
  id: number;
  userId: number | null;
  action: string;
  entityType: string;
  entityId: string | null;
  beforeJson: unknown;
  afterJson: unknown;
  metadataJson: unknown;
  ipAddress: string | null;
  userAgent: string | null;
  createdAt: string;
  user: { id: number; email: string; role: string } | null;
};

export type AuditLogFilters = {
  userId?: number;
  action?: string;
  entityType?: string;
  entityId?: string;
  limit?: number;
  offset?: number;
};

export async function listAuditLogs(filters: AuditLogFilters = {}) {
  const { data } = await api.get("/api/admin/audit-logs", { params: filters });
  return data as { total: number; limit: number; offset: number; rows: AuditLogRow[] };
}

// ─── Campaign Generator ──────────────────────────────────────────────

export type CampaignAsset = {
  format: string;
  label: string;
  maxChars: number;
  variants: string[];
};

export type CampaignPlatform = {
  id: string;
  name: string;
  assets: CampaignAsset[];
};

export type CampaignResult = {
  brief: string;
  locale: string;
  language: string;
  platforms: CampaignPlatform[];
  generatedAt: string;
};

export async function getCampaignCatalogue() {
  const { data } = await api.get("/api/campaign/catalogue");
  return data.platforms as CampaignPlatform[];
}

export async function generateCampaign(payload: {
  brief: string;
  locale: string;
  persona?: string;
  tone?: string;
  platforms?: string[];
}) {
  const { data } = await api.post("/api/campaign/generate", payload, { timeout: 180000 });
  return data as CampaignResult;
}

export type ReviewQueueRow = {
  outputId: number;
  outputText: string;
  approved: boolean;
  score: number | null;
  createdAt: string;
  reviewCount: number;
  job: {
    id: number;
    sourceText: string;
    targetLocale: string;
    textType: string;
    createdByUserId: number | null;
    createdBy: { email: string } | null;
  };
  latestReview: {
    id: number;
    decision: string;
    note: string | null;
    reviewerUserId: number | null;
    createdAt: string;
    reviewer: { email: string } | null;
  } | null;
};

export type ReviewQueueFilters = {
  status?: "pending" | "approved" | "rejected" | "all";
  limit?: number;
  offset?: number;
};

export async function listReviewQueue(filters: ReviewQueueFilters = {}) {
  const { data } = await api.get("/api/admin/review-queue", { params: filters });
  return data as { total: number; limit: number; offset: number; outputs: ReviewQueueRow[] };
}

export type OutputVersion = {
  id: number;
  versionNumber: number;
  eventType: "initial_generation" | "review_update" | "admin_override" | "system_regeneration";
  outputText: string;
  correctedTranslation: string | null;
  approved: boolean;
  reviewNote: string | null;
  score: number | null;
  issueCodesJson: string | null;
  triggeringReviewId: number | null;
  createdByUserId: number | null;
  createdAt: string;
};

export async function getOutputHistory(outputId: number) {
  const { data } = await api.get(`/api/review/${outputId}/history`);
  return data.versions as OutputVersion[];
}

export async function getMe() {
  const response = await api.get("/api/auth/me");
  return response.data as {
    clerk: {
      userId: string;
      email: string | null;
      emailVerified: boolean;
      firstName: string | null;
      lastName: string | null;
    };
    user: {
      id: number;
      email: string;
      fullName: string | null;
      role: "USER" | "REVIEWER" | "MANAGER" | "ADMIN";
      isActive: boolean;
      createdAt: string;
    };
  };
}

export async function getOptions() {
  const response = await api.get("/api/options");
  return response.data;
}

export async function createTranslation(request: TranslationRequest) {
  const response = await api.post("/api/translate", request, { timeout: 120000 });
  return response.data;
}

export async function getGlossary() {
  const response = await api.get("/api/glossary");
  return response.data;
}

export async function createGlossaryTerm(term: GlossaryTermCreate) {
  const response = await api.post("/api/glossary", term);
  return response.data;
}

export async function getMemoryEntries() {
  const response = await api.get("/api/memory");
  return response.data;
}

export async function getTranslationAlternatives(text: string, locale: string, maxChars?: number, formatContext?: string) {
  const response = await api.post("/api/batch/alternatives", { text, locale, maxChars, formatContext, count: 3 });
  return response.data;
}

export async function runBatchTranslation(texts: string[], locales: string[], maxChars?: number, formatContext?: string) {
  const response = await api.post("/api/batch", { texts, locales, maxChars, formatContext }, { timeout: 180000 });
  return response.data;
}

export async function submitReview(outputId: number, review: ReviewRequest) {
  const response = await api.post(`/api/review/${outputId}`, review);
  return response.data;
}

export async function runDemoCheck(text: string, locale: string) {
  console.log("API call - runDemoCheck:", { text, locale });
  try {
    const response = await api.post("/api/demo/check", { text, locale });
    console.log("API response:", response.data);
    return response.data;
  } catch (error) {
    console.error("API error:", error);
    throw error;
  }
}
