/**
 * PublisherAdmin — internal admin/research UI for the Publisher / Market Intelligence layer.
 *
 * Sub-views:
 *  - Sources: list/filter + detail + items
 *  - Ranking: sort by score type, filter by funnel role
 *  - Context Pack: preview market context for a locale/audience
 *  - Channel Plan: preview channel recommendations by campaign goal
 *
 * NOT a compliance UI. Advisory/research only.
 */

import { useState, useEffect, useCallback } from "react";
import * as api from "../api/publisher";

type SubTab = "sources" | "ranking" | "context" | "plan";

const SUB_TABS: { id: SubTab; label: string }[] = [
  { id: "sources", label: "Sources" },
  { id: "ranking", label: "Ranking & Funnel" },
  { id: "context", label: "Context Pack" },
  { id: "plan",    label: "Channel Plan" },
];

const LOCALES = ["it-IT", "es-ES", "nl-NL", "fr-FR", "nl-BE", "fr-BE", "en-GB"] as const;
const COUNTRIES = ["IT", "ES", "NL", "FR", "BE", "GB"] as const;
const SOURCE_CLASSES = ["publisher", "exchange", "community", "business_media", "official_market"] as const;
const AUDIENCE_TYPES = ["retail", "active_trader", "professional", "mass_market"] as const;
const FUNNEL_ROLES = ["awareness", "research", "high_intent", "community", "official_market"] as const;
const CAMPAIGN_GOALS = ["awareness", "education", "research", "active_trader_engagement", "partner_alignment"] as const;
const SORT_BYS = ["composite", "authority", "intent", "partner", "relevance", "safety"] as const;

export default function PublisherAdmin() {
  const [tab, setTab] = useState<SubTab>("sources");

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.25rem", borderBottom: "1px solid var(--border)", paddingBottom: "0.5rem" }}>
        {SUB_TABS.map(t => (
          <button
            key={t.id}
            className={`btn btn-sm ${tab === t.id ? "btn-primary" : "btn-ghost"}`}
            onClick={() => setTab(t.id)}
          >
            {t.label}
          </button>
        ))}
      </div>

      {tab === "sources" && <SourcesPanel />}
      {tab === "ranking" && <RankingPanel />}
      {tab === "context" && <ContextPackPanel />}
      {tab === "plan"    && <ChannelPlanPanel />}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SOURCES
// ═══════════════════════════════════════════════════════════════════════

function SourcesPanel() {
  const [sources, setSources] = useState<any[]>([]);
  const [stats, setStats] = useState<any | null>(null);
  const [country, setCountry] = useState("");
  const [sourceClass, setSourceClass] = useState("");
  const [audienceType, setAudienceType] = useState("");
  const [selected, setSelected] = useState<any | null>(null);
  const [items, setItems] = useState<any[]>([]);
  const [syncing, setSyncing] = useState(false);
  const [syncResult, setSyncResult] = useState<any[] | null>(null);

  const load = useCallback(() => {
    const filters: any = {};
    if (country) filters.country = country;
    if (sourceClass) filters.sourceClass = sourceClass;
    if (audienceType) filters.audienceType = audienceType;
    api.listPublisherSources(filters).then(setSources).catch(console.error);
  }, [country, sourceClass, audienceType]);

  useEffect(() => { load(); }, [load]);
  useEffect(() => { api.getPublisherStats().then(setStats).catch(() => setStats(null)); }, []);

  const selectSource = async (code: string) => {
    const res = await api.getPublisherSource(code);
    setSelected(res.source);
    setItems(res.documents ?? []);
  };

  const handleSync = async () => {
    setSyncing(true);
    setSyncResult(null);
    try {
      const res = await api.triggerPublisherSync(selected?.code);
      setSyncResult(res);
      if (selected) await selectSource(selected.code);
    } catch (e: any) {
      setSyncResult([{ error: e.message }]);
    }
    setSyncing(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Stats */}
      {stats && (
        <div className="card">
          <div className="card-header"><span className="card-title">Registry ({stats.total} sources)</span></div>
          <div className="card-body" style={{ fontSize: "0.8125rem", display: "flex", gap: "2rem", flexWrap: "wrap" }}>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text-3)", fontSize: "0.75rem" }}>By country</div>
              {Object.entries(stats.byCountry).map(([k, v]: any) => (
                <div key={k}><span className="badge badge-gray">{k}</span> {v}</div>
              ))}
            </div>
            <div>
              <div style={{ fontWeight: 600, color: "var(--text-3)", fontSize: "0.75rem" }}>By class</div>
              {Object.entries(stats.byClass).map(([k, v]: any) => (
                <div key={k}><span className="badge badge-gray">{k}</span> {v}</div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* Filters + sources table */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Publisher sources</span>
          <button className="btn btn-sm btn-secondary" onClick={handleSync} disabled={syncing}>
            {syncing ? "Syncing..." : (selected ? `Sync ${selected.code}` : "Sync All")}
          </button>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "0.5rem" }}>
          <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
            <select className="select" style={{ width: "120px", fontSize: "0.8125rem" }} value={country} onChange={e => setCountry(e.target.value)}>
              <option value="">All countries</option>
              {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="select" style={{ width: "170px", fontSize: "0.8125rem" }} value={sourceClass} onChange={e => setSourceClass(e.target.value)}>
              <option value="">All classes</option>
              {SOURCE_CLASSES.map(c => <option key={c} value={c}>{c}</option>)}
            </select>
            <select className="select" style={{ width: "170px", fontSize: "0.8125rem" }} value={audienceType} onChange={e => setAudienceType(e.target.value)}>
              <option value="">All audiences</option>
              {AUDIENCE_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
            </select>
          </div>
        </div>
        <div className="card-body" style={{ padding: 0 }}>
          <table style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <Th>Code</Th><Th>Country</Th><Th>Class</Th><Th>Audience</Th><Th>Relationship</Th><Th>Funnel</Th>
              </tr>
            </thead>
            <tbody>
              {sources.map(s => (
                <tr key={s.code}
                  onClick={() => selectSource(s.code)}
                  style={{ borderBottom: "1px solid var(--border)", cursor: "pointer", background: selected?.code === s.code ? "var(--blue-light)" : undefined }}>
                  <Td><strong>{s.code}</strong></Td>
                  <Td><span className="badge badge-gray">{s.country}</span></Td>
                  <Td>{s.sourceClass}</Td>
                  <Td>{s.audienceType}</Td>
                  <Td style={{ fontSize: "0.75rem" }}>{s.relationshipType}</Td>
                  <Td style={{ fontSize: "0.75rem" }}>{(s.funnelRoles ?? []).join(", ")}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {syncResult && (
        <div className="card" style={{ background: "var(--blue-light)" }}>
          <div className="card-body" style={{ fontSize: "0.8125rem" }}>
            <strong>Sync results:</strong>
            {syncResult.map((r: any, i: number) => (
              <div key={i}>{r.sourceCode}: {r.status} — {r.itemsCreated ?? 0} created, {r.itemsFiltered ?? 0} filtered</div>
            ))}
          </div>
        </div>
      )}

      {/* Selected source detail */}
      {selected && (
        <div className="card">
          <div className="card-header"><span className="card-title">{selected.code} — {selected.name}</span></div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem", fontSize: "0.8125rem" }}>
            <div><strong>URL:</strong> <a href={selected.canonicalUrl} target="_blank" rel="noreferrer" style={{ color: "var(--blue)" }}>{selected.canonicalUrl}</a></div>
            <div><strong>Ingestion mode:</strong> {selected.ingestionMode}</div>
            <div><strong>Coverage:</strong> {(selected.coverageFocus ?? []).join(", ")}</div>
            <div><strong>Notes:</strong> {selected.notes}</div>

            {/* Scoring block */}
            <div>
              <strong>Scoring:</strong>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(120px, 1fr))", gap: "0.5rem", marginTop: "0.25rem" }}>
                <ScoreBadge label="Authority" value={selected.scoring?.authorityScore} />
                <ScoreBadge label="Intent" value={selected.scoring?.audienceIntentScore} />
                <ScoreBadge label="Safety" value={selected.scoring?.brandSafetyScore} />
                <ScoreBadge label="Partner" value={selected.scoring?.partnerPriority} />
                <ScoreBadge label="Relevance" value={selected.scoring?.marketRelevanceScore} />
              </div>
            </div>

            {/* Funnel */}
            <div>
              <strong>Funnel roles:</strong>
              {(selected.funnelRoles ?? []).map((r: string) => (
                <span key={r} className="badge badge-blue" style={{ marginLeft: "0.25rem" }}>{r}</span>
              ))}
            </div>

            {/* Include/exclude filters (crypto visibility) */}
            <details>
              <summary style={{ cursor: "pointer", fontWeight: 600 }}>Filters — includePaths, excludeTags (crypto), excludePaths</summary>
              <div style={{ marginTop: "0.5rem", padding: "0.5rem", background: "var(--bg)", borderRadius: "var(--radius-sm)", fontSize: "0.75rem" }}>
                <div><strong>includePaths:</strong> {(selected.includePaths ?? []).join(", ") || "(none)"}</div>
                <div><strong>includeTags:</strong> {(selected.includeTags ?? []).join(", ") || "(none)"}</div>
                <div><strong>excludeTags (crypto/VA):</strong> {(selected.excludeTags ?? []).join(", ") || "(none)"}</div>
                <div><strong>excludePaths (crypto/VA):</strong> {(selected.excludePaths ?? []).join(", ") || "(none)"}</div>
              </div>
            </details>

            {/* Items */}
            {items.length > 0 && (
              <div>
                <strong>Items ({items.length}):</strong>
                <div style={{ marginTop: "0.25rem", maxHeight: "200px", overflow: "auto", fontSize: "0.75rem" }}>
                  {items.map(i => (
                    <div key={i.id} style={{ padding: "0.375rem 0", borderBottom: "1px solid var(--border)" }}>
                      <div><strong>{i.title}</strong></div>
                      <div style={{ color: "var(--text-3)" }}>section: {i.section ?? "—"} — {i.summary?.substring(0, 80) ?? "no summary"}</div>
                      {i.url && <a href={i.url} target="_blank" rel="noreferrer" style={{ color: "var(--blue)", fontSize: "0.6875rem" }}>{i.url}</a>}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// RANKING & FUNNEL
// ═══════════════════════════════════════════════════════════════════════

function RankingPanel() {
  const [country, setCountry] = useState("IT");
  const [audienceType, setAudienceType] = useState("");
  const [funnelRole, setFunnelRole] = useState("");
  const [sortBy, setSortBy] = useState<string>("composite");
  const [ranked, setRanked] = useState<any[]>([]);

  const load = useCallback(() => {
    const filters: any = { country, sortBy, limit: 15 };
    if (audienceType) filters.audienceType = audienceType;
    if (funnelRole) filters.funnelRole = funnelRole;
    api.getRankedPublishers(filters).then(d => setRanked(d.sources)).catch(console.error);
  }, [country, audienceType, funnelRole, sortBy]);

  useEffect(() => { load(); }, [load]);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap" }}>
        <select className="select" style={{ width: "120px", fontSize: "0.8125rem" }} value={country} onChange={e => setCountry(e.target.value)}>
          {COUNTRIES.map(c => <option key={c} value={c}>{c}</option>)}
        </select>
        <select className="select" style={{ width: "170px", fontSize: "0.8125rem" }} value={audienceType} onChange={e => setAudienceType(e.target.value)}>
          <option value="">Any audience</option>
          {AUDIENCE_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <select className="select" style={{ width: "170px", fontSize: "0.8125rem" }} value={funnelRole} onChange={e => setFunnelRole(e.target.value)}>
          <option value="">Any funnel</option>
          {FUNNEL_ROLES.map(f => <option key={f} value={f}>{f}</option>)}
        </select>
        <select className="select" style={{ width: "140px", fontSize: "0.8125rem" }} value={sortBy} onChange={e => setSortBy(e.target.value)}>
          {SORT_BYS.map(s => <option key={s} value={s}>sort: {s}</option>)}
        </select>
      </div>

      <div className="card">
        <div className="card-body" style={{ padding: 0 }}>
          <table style={{ width: "100%", fontSize: "0.8125rem", borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                <Th>Code</Th><Th>Composite</Th><Th>Auth</Th><Th>Intent</Th><Th>Safety</Th><Th>Partner</Th><Th>Relev</Th><Th>Funnel</Th>
              </tr>
            </thead>
            <tbody>
              {ranked.map((s, i) => (
                <tr key={s.code} style={{ borderBottom: "1px solid var(--border)" }}>
                  <Td><strong>{i + 1}. {s.code}</strong></Td>
                  <Td><strong style={{ color: "var(--blue)" }}>{s.compositeScore}</strong></Td>
                  <Td>{s.scoring?.authorityScore}</Td>
                  <Td>{s.scoring?.audienceIntentScore}</Td>
                  <Td>{s.scoring?.brandSafetyScore}</Td>
                  <Td>{s.scoring?.partnerPriority}</Td>
                  <Td>{s.scoring?.marketRelevanceScore}</Td>
                  <Td style={{ fontSize: "0.75rem" }}>{(s.funnelRoles ?? []).join(", ")}</Td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CONTEXT PACK
// ═══════════════════════════════════════════════════════════════════════

function ContextPackPanel() {
  const [locale, setLocale] = useState("it-IT");
  const [audienceType, setAudienceType] = useState("retail");
  const [pack, setPack] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const p = await api.getMarketContextPack({ locale, audienceType });
      setPack(p);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <select className="select" style={{ width: "120px", fontSize: "0.8125rem" }} value={locale} onChange={e => setLocale(e.target.value)}>
          {LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="select" style={{ width: "170px", fontSize: "0.8125rem" }} value={audienceType} onChange={e => setAudienceType(e.target.value)}>
          {AUDIENCE_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" onClick={load} disabled={loading}>{loading ? "Loading..." : "Preview pack"}</button>
      </div>

      {pack && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{pack.locale} ({pack.country}) — {pack.language}</span>
          </div>
          <div className="card-body" style={{ fontSize: "0.8125rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div><strong>Audience profile:</strong> {pack.audienceProfile}</div>

            <div>
              <strong>Top sources ({pack.topSources.length}):</strong>
              {pack.topSources.map((s: any) => (
                <div key={s.code} style={{ marginLeft: "1rem", fontSize: "0.75rem" }}>
                  <span className="badge badge-blue">{s.code}</span> {s.name} — {s.sourceClass}, {s.audienceType} — funnel: {(s.funnelRoles ?? []).join(", ")}
                </div>
              ))}
            </div>

            <SourceList label={`Partner sources (${pack.partnerSources.length})`} sources={pack.partnerSources} />
            <SourceList label={`Official market (${pack.officialMarketSources.length})`} sources={pack.officialMarketSources} />
            <SourceList label={`Community (${pack.communitySources.length})`} sources={pack.communitySources} />

            <div><strong>Editorial themes:</strong> {(pack.editorialThemes ?? []).map((t: string) => <span key={t} className="badge badge-gray" style={{ marginLeft: "0.25rem" }}>{t}</span>)}</div>
            <div><strong>Channel hints:</strong><ul style={{ marginLeft: "1.5rem", marginTop: "0.25rem" }}>{(pack.channelHints ?? []).map((h: string, i: number) => <li key={i}>{h}</li>)}</ul></div>
            <div><strong>Preferred framing:</strong><ul style={{ marginLeft: "1.5rem", marginTop: "0.25rem" }}>{(pack.preferredFraming ?? []).map((f: string, i: number) => <li key={i}>{f}</li>)}</ul></div>
            <div>
              <strong>Excluded themes (crypto/VA):</strong>{" "}
              {(pack.excludedThemes ?? []).map((t: string) => <span key={t} className="badge badge-red" style={{ marginLeft: "0.25rem", fontSize: "0.6875rem" }}>{t}</span>)}
            </div>

            <div style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>
              <strong>Notes:</strong> {pack.notes}<br/>
              <strong>Provenance:</strong> {pack.provenance}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// CHANNEL PLAN
// ═══════════════════════════════════════════════════════════════════════

function ChannelPlanPanel() {
  const [locale, setLocale] = useState("it-IT");
  const [campaignGoal, setCampaignGoal] = useState<string>("awareness");
  const [audienceType, setAudienceType] = useState("retail");
  const [plan, setPlan] = useState<any | null>(null);
  const [loading, setLoading] = useState(false);

  const load = async () => {
    setLoading(true);
    try {
      const p = await api.getChannelPlan({ locale, campaignGoal, audienceType });
      setPlan(p);
    } catch (e) { console.error(e); }
    setLoading(false);
  };

  useEffect(() => { load(); /* eslint-disable-next-line */ }, []);

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", alignItems: "center" }}>
        <select className="select" style={{ width: "120px", fontSize: "0.8125rem" }} value={locale} onChange={e => setLocale(e.target.value)}>
          {LOCALES.map(l => <option key={l} value={l}>{l}</option>)}
        </select>
        <select className="select" style={{ width: "220px", fontSize: "0.8125rem" }} value={campaignGoal} onChange={e => setCampaignGoal(e.target.value)}>
          {CAMPAIGN_GOALS.map(g => <option key={g} value={g}>{g}</option>)}
        </select>
        <select className="select" style={{ width: "170px", fontSize: "0.8125rem" }} value={audienceType} onChange={e => setAudienceType(e.target.value)}>
          {AUDIENCE_TYPES.map(a => <option key={a} value={a}>{a}</option>)}
        </select>
        <button className="btn btn-sm btn-primary" onClick={load} disabled={loading}>{loading ? "Loading..." : "Build plan"}</button>
      </div>

      {plan && (
        <div className="card">
          <div className="card-header">
            <span className="card-title">{plan.locale} — {plan.campaignGoal} — {plan.audienceType}</span>
          </div>
          <div className="card-body" style={{ fontSize: "0.8125rem", display: "flex", flexDirection: "column", gap: "0.75rem" }}>
            <div style={{ color: "var(--text-3)" }}>{plan.summary}</div>

            <div>
              <strong>Recommended ({plan.recommended.length}):</strong>
              <table style={{ width: "100%", fontSize: "0.75rem", borderCollapse: "collapse", marginTop: "0.5rem" }}>
                <thead>
                  <tr style={{ borderBottom: "1px solid var(--border)", textAlign: "left" }}>
                    <Th>#</Th><Th>Code</Th><Th>Score</Th><Th>Class</Th><Th>Audience</Th><Th>Funnel</Th><Th>Reason</Th>
                  </tr>
                </thead>
                <tbody>
                  {plan.recommended.map((r: any, i: number) => (
                    <tr key={r.code} style={{ borderBottom: "1px solid var(--border)" }}>
                      <Td>{i + 1}</Td>
                      <Td><strong>{r.code}</strong></Td>
                      <Td><strong style={{ color: "var(--blue)" }}>{r.goalScore}</strong></Td>
                      <Td>{r.sourceClass}</Td>
                      <Td>{r.audienceType}</Td>
                      <Td style={{ fontSize: "0.6875rem" }}>{(r.funnelRoles ?? []).join(", ")}</Td>
                      <Td style={{ fontSize: "0.6875rem" }}>{r.selectionReason}</Td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            {plan.excluded.length > 0 && (
              <details>
                <summary style={{ cursor: "pointer", fontWeight: 600 }}>Excluded sources ({plan.excluded.length})</summary>
                <div style={{ marginTop: "0.5rem", fontSize: "0.75rem" }}>
                  {plan.excluded.map((e: any) => (
                    <div key={e.code} style={{ padding: "0.25rem 0" }}>
                      <span className="badge badge-amber">{e.code}</span> {e.reason}
                    </div>
                  ))}
                </div>
              </details>
            )}

            <div style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>
              <strong>Provenance:</strong> {plan.provenance}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// ═══════════════════════════════════════════════════════════════════════
// SHARED SMALL COMPONENTS
// ═══════════════════════════════════════════════════════════════════════

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "0.5rem 0.75rem", fontWeight: 600, fontSize: "0.75rem", color: "var(--text-3)" }}>{children}</th>;
}

function Td({ children, style }: { children: React.ReactNode; style?: React.CSSProperties }) {
  return <td style={{ padding: "0.5rem 0.75rem", ...style }}>{children}</td>;
}

function ScoreBadge({ label, value }: { label: string; value?: number }) {
  const v = value ?? 0;
  const color = v >= 80 ? "badge-green" : v >= 60 ? "badge-blue" : v >= 40 ? "badge-gray" : "badge-amber";
  return (
    <div style={{ textAlign: "center", padding: "0.375rem", background: "var(--bg)", borderRadius: "var(--radius-sm)" }}>
      <div style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>{label}</div>
      <span className={`badge ${color}`} style={{ fontSize: "0.875rem", fontWeight: 700 }}>{v}</span>
    </div>
  );
}

function SourceList({ label, sources }: { label: string; sources: any[] }) {
  if (!sources || sources.length === 0) return null;
  return (
    <div>
      <strong>{label}:</strong>{" "}
      {sources.map((s: any) => (
        <span key={s.code} className="badge badge-gray" style={{ marginLeft: "0.25rem", fontSize: "0.6875rem" }}>{s.code}</span>
      ))}
    </div>
  );
}
