/**
 * Inline version-history surface for a TranslationOutput.
 *
 * Reads from GET /api/review/:outputId/history. Same ownership/RBAC as
 * the review endpoint: USER sees only versions of their own outputs;
 * REVIEWER+ sees all. Backend returns 404 on mismatch — we render
 * nothing visibly in that case.
 *
 * Renders collapsed by default. When expanded, shows each version as a
 * small row with: vN, eventType, decision badge (when applicable),
 * outputText, optional correctedTranslation diff hint.
 */

import { useEffect, useState } from "react";
import { getOutputHistory, type OutputVersion } from "../api/client";

const EVENT_LABELS: Record<OutputVersion["eventType"], string> = {
  initial_generation: "Initial",
  review_update: "Review update",
  admin_override: "Admin override",
  system_regeneration: "System regeneration",
};

export interface HistoryPanelProps {
  outputId: number;
  /** Compact variant for dense grids (Batch). */
  compact?: boolean;
}

export default function HistoryPanel({ outputId, compact = false }: HistoryPanelProps) {
  const [open, setOpen] = useState(false);
  const [versions, setVersions] = useState<OutputVersion[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    if (!open || versions !== null) return;
    setLoading(true);
    setErr(null);
    getOutputHistory(outputId)
      .then(setVersions)
      .catch((e) => setErr(e?.response?.data?.error ?? e?.message ?? "Failed to load history."))
      .finally(() => setLoading(false));
  }, [open, outputId, versions]);

  if (!open) {
    return (
      <div style={{
        padding: compact ? "0.25rem 0.5rem" : "0.4rem 1rem",
        borderTop: "1px solid var(--border)",
        fontSize: compact ? "0.7rem" : "0.75rem",
      }}>
        <button
          className="btn btn-ghost btn-sm"
          onClick={() => setOpen(true)}
          style={{ fontSize: compact ? "0.7rem" : "0.75rem", padding: compact ? "0.1rem 0.4rem" : "0.15rem 0.5rem" }}>
          ▸ History
        </button>
      </div>
    );
  }

  return (
    <div style={{
      padding: compact ? "0.4rem 0.5rem" : "0.5rem 1rem",
      borderTop: "1px solid var(--border)",
      background: "var(--bg, #f7f8fa)",
    }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.4rem" }}>
        <span style={{ fontSize: compact ? "0.7rem" : "0.75rem", color: "var(--text-3)", fontWeight: 600 }}>
          Version history {versions ? `(${versions.length})` : ""}
        </span>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} style={{ fontSize: compact ? "0.7rem" : "0.75rem", padding: "0.1rem 0.4rem" }}>×</button>
      </div>

      {loading && <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>Loading…</div>}
      {err && <div style={{ fontSize: "0.75rem", color: "var(--danger, #c00)" }}>{err}</div>}

      {versions && versions.length === 0 && (
        <div style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>No history yet.</div>
      )}

      {versions && versions.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.4rem" }}>
          {versions.map((v) => (
            <div key={v.id} style={{
              padding: compact ? "0.35rem 0.5rem" : "0.4rem 0.6rem",
              borderRadius: "var(--radius-sm)",
              background: "var(--surface, #fff)",
              border: "1px solid var(--border-subtle, #eee)",
              fontSize: compact ? "0.7rem" : "0.75rem",
            }}>
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.2rem", flexWrap: "wrap" }}>
                <strong>v{v.versionNumber}</strong>
                <span style={{ color: "var(--text-3)" }}>{EVENT_LABELS[v.eventType] ?? v.eventType}</span>
                {v.approved && <span className="badge badge-green" style={{ fontSize: "0.65rem" }}>Approved</span>}
                {!v.approved && v.eventType === "review_update" && (
                  <span className="badge badge-amber" style={{ fontSize: "0.65rem" }}>Rejected</span>
                )}
                {v.score != null && (
                  <span className="badge badge-gray" style={{ fontSize: "0.65rem" }}>
                    Score {Math.round(v.score * 100)}%
                  </span>
                )}
                <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: "0.65rem" }}>
                  {new Date(v.createdAt).toLocaleString()}
                </span>
              </div>
              <div style={{ fontFamily: "ui-sans-serif, system-ui", color: "var(--text-1)", whiteSpace: "pre-wrap" }}>
                {v.outputText}
              </div>
              {v.correctedTranslation && v.correctedTranslation.trim().length > 0 && (
                <div style={{ marginTop: "0.3rem", padding: "0.25rem 0.4rem", background: "var(--blue-light, #eff5ff)", borderRadius: "var(--radius-sm)" }}>
                  <span style={{ fontSize: "0.65rem", color: "var(--text-3)", fontWeight: 600 }}>Reviewer correction: </span>
                  <span style={{ whiteSpace: "pre-wrap" }}>{v.correctedTranslation}</span>
                </div>
              )}
              {v.reviewNote && v.reviewNote.trim().length > 0 && (
                <div style={{ marginTop: "0.25rem", fontSize: "0.7rem", color: "var(--text-3)" }}>
                  Note: {v.reviewNote}
                </div>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
