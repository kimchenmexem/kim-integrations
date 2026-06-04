/**
 * Reviewer Queue — a list of recent TranslationOutput rows that need
 * (or may need) review. Visible to REVIEWER / MANAGER / ADMIN.
 *
 * Filter bar at the top: pending / approved / rejected / all.
 * Each row shows the source text, the translation, current status,
 * latest reviewer (if any), and an expand button that opens an
 * inline ReviewPanel so the reviewer can submit feedback without
 * leaving the page.
 */

import { useEffect, useState, useCallback } from "react";
import {
  listReviewQueue,
  type ReviewQueueRow,
  type ReviewQueueFilters,
} from "../api/client";
import ReviewPanel from "./ReviewPanel";

const STATUS_OPTIONS: { id: NonNullable<ReviewQueueFilters["status"]>; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

const PAGE_SIZE = 50;

export default function ReviewerQueue() {
  const [rows, setRows] = useState<ReviewQueueRow[]>([]);
  const [total, setTotal] = useState(0);
  const [offset, setOffset] = useState(0);
  const [status, setStatus] = useState<NonNullable<ReviewQueueFilters["status"]>>("pending");
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState<string | null>(null);
  const [expanded, setExpanded] = useState<Record<number, boolean>>({});

  const load = useCallback(async (overrideOffset?: number) => {
    setLoading(true);
    setErr(null);
    try {
      const data = await listReviewQueue({ status, limit: PAGE_SIZE, offset: overrideOffset ?? offset });
      setRows(data.outputs);
      setTotal(data.total);
      if (overrideOffset !== undefined) setOffset(overrideOffset);
    } catch (e: any) {
      setErr(e?.response?.data?.error ?? e?.message ?? "Failed to load queue.");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status, offset]);

  useEffect(() => {
    void load(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [status]);

  const pageStart = offset + 1;
  const pageEnd = Math.min(offset + rows.length, total);

  return (
    <div>
      {/* Filter bar */}
      <div style={{ display: "flex", gap: "0.4rem", marginBottom: "1rem", alignItems: "center", flexWrap: "wrap" }}>
        {STATUS_OPTIONS.map((s) => (
          <button
            key={s.id}
            className={`btn btn-sm ${status === s.id ? "btn-primary" : "btn-secondary"}`}
            onClick={() => setStatus(s.id)}
            style={{ fontSize: "0.8rem" }}>
            {s.label}
          </button>
        ))}
        <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: "0.8rem" }}>
          {loading ? "Loading…" : total === 0 ? "no results" : `${pageStart}–${pageEnd} of ${total}`}
        </span>
      </div>

      {err && <div style={{ padding: "0.75rem", color: "var(--danger, #c00)", fontSize: "0.85rem" }}>{err}</div>}

      {/* Rows */}
      {rows.length === 0 && !loading && (
        <div style={{ padding: "2rem", textAlign: "center", color: "var(--text-3)", fontSize: "0.875rem" }}>
          No translations to review.
        </div>
      )}

      <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
        {rows.map((r) => (
          <div key={r.outputId} className="card">
            <div style={{ padding: "0.75rem 1rem", display: "flex", flexDirection: "column", gap: "0.4rem" }}>
              {/* Header row */}
              <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap", fontSize: "0.75rem" }}>
                <span className="badge badge-gray">{r.job.targetLocale}</span>
                <span style={{ color: "var(--text-3)" }}>{r.job.textType}</span>
                {r.approved && <span className="badge badge-green">Approved</span>}
                {!r.approved && r.reviewCount > 0 && <span className="badge badge-amber">Rejected</span>}
                {r.reviewCount === 0 && <span className="badge badge-gray">Pending</span>}
                {r.score != null && (
                  <span className="badge badge-gray">QG {Math.round(r.score * 100)}%</span>
                )}
                <span style={{ marginLeft: "auto", color: "var(--text-3)" }}>
                  by {r.job.createdBy?.email ?? "—"} · {new Date(r.createdAt).toLocaleString()}
                </span>
              </div>

              {/* Source */}
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginBottom: "0.15rem" }}>Source</div>
                <div style={{ fontSize: "0.85rem", color: "var(--text-2)", whiteSpace: "pre-wrap" }}>{r.job.sourceText}</div>
              </div>

              {/* Translation */}
              <div>
                <div style={{ fontSize: "0.7rem", color: "var(--text-3)", marginBottom: "0.15rem" }}>Translation</div>
                <div style={{ fontSize: "0.875rem", color: "var(--text-1)", whiteSpace: "pre-wrap" }}>{r.outputText}</div>
              </div>

              {/* Latest review summary */}
              {r.latestReview && (
                <div style={{
                  marginTop: "0.2rem",
                  padding: "0.4rem 0.6rem",
                  background: "var(--bg, #f7f8fa)",
                  borderRadius: "var(--radius-sm)",
                  fontSize: "0.75rem",
                }}>
                  <strong>Latest review:</strong> {r.latestReview.decision}
                  {r.latestReview.reviewer && <> by <em>{r.latestReview.reviewer.email}</em></>}
                  {r.latestReview.note && <> — {r.latestReview.note}</>}
                </div>
              )}

              <div>
                <button
                  className="btn btn-sm btn-secondary"
                  onClick={() => setExpanded((e) => ({ ...e, [r.outputId]: !e[r.outputId] }))}
                  style={{ fontSize: "0.75rem" }}>
                  {expanded[r.outputId] ? "Close review" : "Review →"}
                </button>
              </div>
            </div>

            {expanded[r.outputId] && (
              <ReviewPanel
                outputId={r.outputId}
                onReviewSubmitted={() => { void load(); }}
              />
            )}
          </div>
        ))}
      </div>

      {/* Pagination */}
      {total > rows.length && (
        <div style={{ display: "flex", gap: "0.5rem", marginTop: "0.75rem", alignItems: "center" }}>
          <button className="btn btn-secondary" disabled={loading || offset === 0} onClick={() => load(Math.max(0, offset - PAGE_SIZE))} style={{ fontSize: "0.8rem" }}>← Prev</button>
          <button className="btn btn-secondary" disabled={loading || offset + rows.length >= total} onClick={() => load(offset + PAGE_SIZE)} style={{ fontSize: "0.8rem" }}>Next →</button>
        </div>
      )}
    </div>
  );
}
