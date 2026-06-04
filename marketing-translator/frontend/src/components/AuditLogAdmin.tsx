import { useEffect, useState, useCallback } from "react";
import { listAuditLogs, type AuditLogRow, type AuditLogFilters } from "../api/client";

const PAGE_SIZE = 50;

export default function AuditLogAdmin() {
  const [rows, setRows] = useState<AuditLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);

  // Filter inputs — kept simple: raw strings committed with a Search button
  // so we don't spam the backend on every keypress.
  const [fAction, setFAction] = useState("");
  const [fEntityType, setFEntityType] = useState("");
  const [fUserId, setFUserId] = useState("");
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const load = useCallback(async (overrideOffset?: number) => {
    setLoading(true);
    setErr(null);
    const f: AuditLogFilters = { limit: PAGE_SIZE, offset: overrideOffset ?? offset };
    if (fAction.trim()) f.action = fAction.trim();
    if (fEntityType.trim()) f.entityType = fEntityType.trim();
    if (fUserId.trim()) {
      const n = Number(fUserId.trim());
      if (!Number.isNaN(n)) f.userId = n;
    }
    try {
      const data = await listAuditLogs(f);
      setRows(data.rows);
      setTotal(data.total);
      if (overrideOffset !== undefined) setOffset(overrideOffset);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "Failed to load audit logs.");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [fAction, fEntityType, fUserId, offset]);

  useEffect(() => { void load(0); /* initial load */ // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function runSearch() { void load(0); }

  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + rows.length, total);

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: "0.5rem", flexWrap: "wrap", marginBottom: "0.75rem", alignItems: "center" }}>
        <input placeholder="action (e.g. glossary.create)" value={fAction} onChange={(e) => setFAction(e.target.value)} style={inputStyle} />
        <input placeholder="entityType (e.g. User)" value={fEntityType} onChange={(e) => setFEntityType(e.target.value)} style={inputStyle} />
        <input placeholder="userId" value={fUserId} onChange={(e) => setFUserId(e.target.value)} style={{ ...inputStyle, width: "110px" }} />
        <button className="btn btn-primary" onClick={runSearch} disabled={loading} style={{ fontSize: "0.8rem" }}>Search</button>
        <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: "0.8rem" }}>
          {loading ? "Loading…" : total === 0 ? "no results" : `${pageStart}–${pageEnd} of ${total}`}
        </span>
      </div>

      {err && <div style={{ padding: "0.75rem", color: "var(--danger, #c00)", fontSize: "0.85rem" }}>{err}</div>}

      {/* Rows */}
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: "0.8rem" }}>
        <thead>
          <tr style={{ textAlign: "left", borderBottom: "1px solid var(--border)", color: "var(--text-3)" }}>
            <th style={{ padding: "0.4rem" }}>ID</th>
            <th style={{ padding: "0.4rem" }}>When</th>
            <th style={{ padding: "0.4rem" }}>Actor</th>
            <th style={{ padding: "0.4rem" }}>Action</th>
            <th style={{ padding: "0.4rem" }}>Entity</th>
            <th style={{ padding: "0.4rem" }}>IP</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <>
              <tr key={r.id} style={{ borderBottom: "1px solid var(--border-subtle, #f0f0f0)" }}>
                <td style={{ padding: "0.4rem", color: "var(--text-3)" }}>{r.id}</td>
                <td style={{ padding: "0.4rem", color: "var(--text-3)", fontSize: "0.75rem" }}>
                  {new Date(r.createdAt).toLocaleString()}
                </td>
                <td style={{ padding: "0.4rem" }}>
                  {r.user ? <>{r.user.email} <span style={{ color: "var(--text-3)" }}>· {r.user.role}</span></> : <span style={{ color: "var(--text-3)" }}>system</span>}
                </td>
                <td style={{ padding: "0.4rem", fontFamily: "monospace", fontSize: "0.75rem" }}>{r.action}</td>
                <td style={{ padding: "0.4rem", fontSize: "0.75rem" }}>
                  {r.entityType}{r.entityId ? `:${r.entityId}` : ""}
                </td>
                <td style={{ padding: "0.4rem", color: "var(--text-3)", fontFamily: "monospace", fontSize: "0.7rem" }}>{r.ipAddress ?? "—"}</td>
                <td style={{ padding: "0.4rem" }}>
                  <button
                    className="btn btn-secondary"
                    style={{ fontSize: "0.7rem", padding: "0.15rem 0.45rem" }}
                    onClick={() => setExpanded((e) => ({ ...e, [r.id]: !e[r.id] }))}
                  >
                    {expanded[r.id] ? "hide" : "detail"}
                  </button>
                </td>
              </tr>
              {expanded[r.id] && (
                <tr>
                  <td colSpan={7} style={{ padding: "0.4rem 0.75rem 0.75rem", background: "var(--bg-subtle, #fafafa)" }}>
                    <JsonBlock label="before" value={r.beforeJson} />
                    <JsonBlock label="after" value={r.afterJson} />
                    <JsonBlock label="metadata" value={r.metadataJson} />
                    {r.userAgent && <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginTop: "0.25rem" }}>UA: {r.userAgent}</div>}
                  </td>
                </tr>
              )}
            </>
          ))}
        </tbody>
      </table>

      {/* Pagination */}
      <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", alignItems: "center" }}>
        <button className="btn btn-secondary" disabled={loading || offset === 0} onClick={() => load(Math.max(0, offset - PAGE_SIZE))} style={{ fontSize: "0.8rem" }}>← Prev</button>
        <button className="btn btn-secondary" disabled={loading || offset + rows.length >= total} onClick={() => load(offset + PAGE_SIZE)} style={{ fontSize: "0.8rem" }}>Next →</button>
      </div>
    </div>
  );
}

function JsonBlock({ label, value }: { label: string; value: unknown }) {
  if (value === null || value === undefined) return null;
  return (
    <div style={{ marginTop: "0.25rem" }}>
      <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginBottom: "0.1rem" }}>{label}</div>
      <pre style={{ margin: 0, padding: "0.4rem", background: "#fff", border: "1px solid var(--border-subtle, #f0f0f0)", fontSize: "0.7rem", overflow: "auto", maxHeight: "180px" }}>
        {JSON.stringify(value, null, 2)}
      </pre>
    </div>
  );
}

const inputStyle: React.CSSProperties = {
  padding: "0.3rem 0.5rem",
  fontSize: "0.8rem",
  border: "1px solid var(--border)",
  borderRadius: "4px",
  width: "180px",
};
