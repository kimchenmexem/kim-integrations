/**
 * API client for compliance source-of-truth endpoints.
 *
 * All requests go through the shared axios instance from ./client, which
 * attaches the Clerk session token. Admin routes are role-gated on the
 * backend (requireRole("MANAGER","ADMIN")) — no per-request token injection here.
 */

import { api } from "./client";

// ─── Standalone Compliance Check (no translation) ──────────────────

export async function runComplianceCheck(payload: {
  text: string;
  locale: string;
  withSuggestedFixes?: boolean;
}) {
  const { data } = await api.post("/api/compliance/check", payload, { timeout: 120000 });
  return data as any;
}

// ─── Sources ────────────────────────────────────────────────────────

export async function listSources(jurisdiction?: string) {
  const params: Record<string, string> = {};
  if (jurisdiction) params.jurisdiction = jurisdiction;
  const { data } = await api.get("/api/compliance/sources", { params });
  return data.sources as any[];
}

export async function getSource(codeOrId: string) {
  const { data } = await api.get(`/api/compliance/sources/${codeOrId}`);
  return data as { source: any; documents: any[] };
}

// ─── Admin: source / document / version upload ────────────────────────

export type CreateSourcePayload = {
  code: string;
  name: string;
  regulator: string;
  jurisdiction: string;
  localeScope: string[];
  sourceType: string;
  canonicality: string;
  parserKey?: string;
  pollCadence?: string;
  active?: boolean;
  baseUrl?: string | null;
  notes?: string | null;
};

export async function createSource(payload: CreateSourcePayload) {
  const { data } = await api.post("/api/compliance/admin/sources", payload);
  return data.source as any;
}

export type CreateDocumentPayload = {
  externalRef: string;
  title: string;
  url?: string | null;
  language?: string | null;
  active?: boolean;
  notes?: string | null;
};

export async function createDocument(sourceCodeOrId: string, payload: CreateDocumentPayload) {
  const { data } = await api.post(
    `/api/compliance/admin/sources/${encodeURIComponent(sourceCodeOrId)}/documents`,
    payload
  );
  return data.document as any;
}

export type UploadVersionPayload = {
  versionLabel: string;
  parsedText: string;
  effectiveFrom?: string | null;
  effectiveUntil?: string | null;
};

export async function uploadDocumentVersion(documentId: number, payload: UploadVersionPayload) {
  const { data } = await api.post(
    `/api/compliance/admin/documents/${documentId}/versions`,
    payload
  );
  return data as { version: any; dedup: boolean };
}

// ─── Admin: forbidden phrases (compliance-driven banned words) ────────

export type ForbiddenPhraseRow = {
  id: number;
  phrase: string;
  localeCode: string;
  reason: string | null;
  active: boolean;
  addedByUserId: number | null;
  triggeringReviewId: number | null;
  createdAt: string;
  updatedAt: string;
};

export async function listForbiddenPhrases(filters: { locale?: string; activeOnly?: boolean } = {}) {
  const params: Record<string, string> = {};
  if (filters.locale !== undefined) params.locale = filters.locale;
  if (filters.activeOnly) params.activeOnly = "true";
  const { data } = await api.get("/api/compliance/admin/forbidden-phrases", { params });
  return data.phrases as ForbiddenPhraseRow[];
}

export async function addForbiddenPhrase(payload: { phrase: string; localeCode: string; reason?: string | null }) {
  const { data } = await api.post("/api/compliance/admin/forbidden-phrases", payload);
  return data.phrase as ForbiddenPhraseRow;
}

export async function deactivateForbiddenPhrase(id: number) {
  const { data } = await api.delete(`/api/compliance/admin/forbidden-phrases/${id}`);
  return data.phrase as ForbiddenPhraseRow;
}

// ─── Documents & versions ───────────────────────────────────────────

export async function listDocuments(sourceId?: number) {
  const params: Record<string, string> = {};
  if (sourceId) params.sourceId = String(sourceId);
  const { data } = await api.get("/api/compliance/documents", { params });
  return data.documents as any[];
}

export async function listVersions(docId: number) {
  const { data } = await api.get(`/api/compliance/documents/${docId}/versions`);
  return data.versions as any[];
}

export async function getDocDiff(docId: number) {
  const { data } = await api.get(`/api/compliance/documents/${docId}/diff`);
  return data.diff as any;
}

// ─── Sync ───────────────────────────────────────────────────────────

export async function triggerSync(source?: string) {
  const params: Record<string, string> = {};
  if (source) params.source = source;
  const { data } = await api.post("/api/compliance/sync", null, { params, timeout: 120000 });
  return data.results as any[];
}

export async function listSyncRuns(sourceCode?: string) {
  const params: Record<string, string> = {};
  if (sourceCode) params.sourceCode = sourceCode;
  const { data } = await api.get("/api/compliance/sync-runs", { params });
  return data.runs as any[];
}

// ─── Obligations ────────────────────────────────────────────────────

export async function listObligations(filters?: { status?: string; jurisdiction?: string }) {
  const { data } = await api.get("/api/compliance/admin/obligations", { params: filters });
  return data.obligations as any[];
}

export async function getObligation(id: number) {
  const { data } = await api.get(`/api/compliance/admin/obligations/${id}`);
  return data.obligation as any;
}

export async function transitionObligation(id: number, status: string, actor: string, note?: string) {
  const { data } = await api.post(`/api/compliance/admin/obligations/${id}/transition`, { status, actor, note });
  return data.obligation as any;
}

// ─── Review tasks ───────────────────────────────────────────────────

export async function listReviewTasks(filters?: { status?: string; kind?: string }) {
  const { data } = await api.get("/api/compliance/admin/review-tasks", { params: filters });
  return data.tasks as any[];
}

export async function decideReviewTask(id: number, decision: string, decidedBy: string, note?: string) {
  const { data } = await api.post(`/api/compliance/admin/review-tasks/${id}/decide`, { decision, decidedBy, note });
  return data.task as any;
}

// ─── Bundles ────────────────────────────────────────────────────────

export async function listBundles(filters?: { localeCode?: string; status?: string }) {
  const { data } = await api.get("/api/compliance/bundles", { params: filters });
  return data.bundles as any[];
}

export async function getBundle(id: number) {
  const { data } = await api.get(`/api/compliance/admin/bundles/${id}`);
  return data.bundle as any;
}

export async function publishBundle(id: number, publishedBy: string) {
  const { data } = await api.post(`/api/compliance/admin/bundles/${id}/publish`, { publishedBy });
  return data.published as any;
}
