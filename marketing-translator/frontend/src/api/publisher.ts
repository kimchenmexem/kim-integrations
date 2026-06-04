/**
 * API client for Publisher / Market Intelligence endpoints.
 * Completely separate from compliance.
 *
 * Shares the axios instance from ./client which attaches the Clerk session
 * token. /sync is role-gated on the backend — no admin-token shim here.
 */

import { api } from "./client";

// ─── Sources ────────────────────────────────────────────────────────

export async function listPublisherSources(filters?: {
  country?: string; sourceClass?: string; audienceType?: string; language?: string;
}) {
  const { data } = await api.get("/api/publishers/sources", { params: filters });
  return data.sources as any[];
}

export async function getPublisherSource(codeOrId: string) {
  const { data } = await api.get(`/api/publishers/sources/${codeOrId}`);
  return data as { source: any; documents: any[] };
}

export async function getPublisherStats() {
  const { data } = await api.get("/api/publishers/stats");
  return data as { total: number; byCountry: Record<string, number>; byClass: Record<string, number> };
}

// ─── Items ──────────────────────────────────────────────────────────

export async function listPublisherItems(filters?: {
  sourceId?: number; sourceCode?: string; country?: string; section?: string;
}) {
  const { data } = await api.get("/api/publishers/items", { params: filters });
  return data.items as any[];
}

// ─── Sync ───────────────────────────────────────────────────────────

export async function triggerPublisherSync(source?: string, country?: string) {
  const params: Record<string, string> = {};
  if (source) params.source = source;
  if (country) params.country = country;
  const { data } = await api.post("/api/publishers/sync", null, { params, timeout: 60000 });
  return data.results as any[];
}

export async function listPublisherSyncRuns(sourceCode?: string) {
  const { data } = await api.get("/api/publishers/sync-runs", { params: sourceCode ? { sourceCode } : {} });
  return data.runs as any[];
}

// ─── Ranking & funnel ───────────────────────────────────────────────

export async function getRankedPublishers(filters?: {
  country?: string; audienceType?: string; funnelRole?: string; sortBy?: string; limit?: number;
}) {
  const { data } = await api.get("/api/publishers/ranked", { params: filters });
  return data as { sources: any[]; total: number; sortedBy: string };
}

export async function getFunnelSources(role: string, country?: string) {
  const { data } = await api.get(`/api/publishers/funnel/${role}`, { params: country ? { country } : {} });
  return data as { funnelRole: string; country: string; sources: any[]; total: number };
}

// ─── Context pack ───────────────────────────────────────────────────

export async function getMarketContextPack(params: {
  locale: string; audienceType?: string; textType?: string;
  sourceClass?: string; coverageFocus?: string;
}) {
  const { data } = await api.get("/api/publishers/context-pack", { params });
  return data.pack as any;
}

// ─── Channel plan ───────────────────────────────────────────────────

export async function getChannelPlan(params: {
  locale: string; campaignGoal: string; audienceType?: string;
  sourceClass?: string; relationship?: string; maxResults?: number;
}) {
  const { data } = await api.get("/api/publishers/channel-plan", { params });
  return data.plan as any;
}
