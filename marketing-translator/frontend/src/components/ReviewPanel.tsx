/**
 * Inline review surface for any persisted TranslationOutput.
 *
 * Extracted from TranslationForm so the same UI is available across
 * Single Translate, Quick Translate, and Batch Translate. The component
 * is intentionally dumb: it takes an `outputId` and posts to
 * /api/review/:outputId. Backend ownership/RBAC rules apply unchanged
 * (USER may review only their own translations; REVIEWER+ may review
 * any; the `forbiddenPhrases` field is REVIEWER+ only and silently
 * dropped for plain USERs).
 *
 * Pass `compact` for inline use inside dense grids (Batch).
 */

import { useState } from "react";
import type { ReviewIssueCode } from "@mexem/shared";
import { submitReview } from "../api/client";
import { useUserRole, isReviewerOrAbove } from "../hooks/useUserRole";

const ISSUE_CODE_LABELS: Record<ReviewIssueCode, string> = {
  tone: "Tone",
  terminology: "Terminology",
  grammar: "Grammar",
  fluency: "Fluency",
  literal_translation: "Literal Translation",
  brand_voice: "Brand Voice",
  register: "Register",
};

const ALL_ISSUE_CODES: ReviewIssueCode[] = [
  "tone", "terminology", "grammar", "fluency", "literal_translation", "brand_voice", "register",
];

export interface ReviewPanelProps {
  outputId: number;
  /** Called after a successful submit so the parent can refresh anything dependent. */
  onReviewSubmitted?: () => void;
  /** Compact variant for dense grids (smaller fonts, narrower textareas). */
  compact?: boolean;
}

export default function ReviewPanel({ outputId, onReviewSubmitted, compact = false }: ReviewPanelProps) {
  const role = useUserRole();
  const canFlagForbidden = isReviewerOrAbove(role);

  const [open, setOpen] = useState(false);
  const [decision, setDecision] = useState<"approved" | "rejected" | null>(null);
  const [selectedCodes, setSelectedCodes] = useState<ReviewIssueCode[]>([]);
  const [note, setNote] = useState("");
  const [correctedTranslation, setCorrectedTranslation] = useState("");
  const [forbiddenPhrases, setForbiddenPhrases] = useState<string[]>([]);
  const [forbiddenDraft, setForbiddenDraft] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [errMsg, setErrMsg] = useState<string | null>(null);

  const addForbiddenFromDraft = () => {
    const trimmed = forbiddenDraft.trim();
    if (!trimmed) return;
    if (forbiddenPhrases.includes(trimmed)) {
      setForbiddenDraft("");
      return;
    }
    setForbiddenPhrases((prev) => [...prev, trimmed]);
    setForbiddenDraft("");
  };

  if (submitted) {
    return (
      <div style={{ padding: compact ? "0.25rem 0.5rem" : "0.5rem 1rem", borderTop: "1px solid var(--border)", fontSize: compact ? "0.75rem" : "0.8125rem", color: "var(--green, #2a8a3e)" }}>
        Review submitted
      </div>
    );
  }

  if (!open) {
    return (
      <div style={{
        padding: compact ? "0.4rem 0.5rem" : "0.625rem 1rem",
        borderTop: "1px solid var(--border)",
        background: "var(--bg, #f7f8fa)",
        display: "flex",
        alignItems: "center",
        gap: "0.5rem",
      }}>
        <span style={{ fontSize: compact ? "0.7rem" : "0.8125rem", color: "var(--text-3)" }}>
          How was this translation?
        </span>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => { setDecision("approved"); setOpen(true); }}
          style={{ fontSize: compact ? "0.7rem" : "0.8125rem", padding: compact ? "0.15rem 0.6rem" : "0.25rem 0.75rem" }}
          aria-label="Approve translation">
          👍 Approve
        </button>
        <button
          className="btn btn-sm btn-secondary"
          onClick={() => { setDecision("rejected"); setOpen(true); }}
          style={{ fontSize: compact ? "0.7rem" : "0.8125rem", padding: compact ? "0.15rem 0.6rem" : "0.25rem 0.75rem" }}
          aria-label="Reject translation">
          👎 Reject
        </button>
      </div>
    );
  }

  const handleSubmit = async () => {
    if (!decision) return;
    setSubmitting(true);
    setErrMsg(null);
    try {
      await submitReview(outputId, {
        decision,
        note: note || undefined,
        issueCodes: selectedCodes.length > 0 ? selectedCodes : undefined,
        correctedTranslation: correctedTranslation || undefined,
        forbiddenPhrases:
          canFlagForbidden && forbiddenPhrases.length > 0 ? forbiddenPhrases : undefined,
      });
      setSubmitted(true);
      onReviewSubmitted?.();
    } catch (e: any) {
      const m = e?.response?.data?.error;
      setErrMsg(typeof m === "string" ? m : "Failed to submit review.");
    } finally {
      setSubmitting(false);
    }
  };

  const fontSize = compact ? "0.75rem" : "0.8125rem";

  return (
    <div style={{ padding: compact ? "0.5rem 0.75rem" : "0.75rem 1rem", borderTop: "1px solid var(--border)", display: "flex", flexDirection: "column", gap: compact ? "0.4rem" : "0.625rem" }}>
      <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
        <button
          className={`btn btn-sm ${decision === "approved" ? "btn-primary" : "btn-secondary"}`}
          style={{ ...(decision === "approved" ? { background: "var(--green)" } : {}), fontSize }}
          onClick={() => setDecision("approved")}>
          Approve
        </button>
        <button
          className={`btn btn-sm ${decision === "rejected" ? "btn-primary" : "btn-secondary"}`}
          style={{ ...(decision === "rejected" ? { background: "var(--red)" } : {}), fontSize }}
          onClick={() => setDecision("rejected")}>
          Reject
        </button>
        <button className="btn btn-ghost btn-sm" onClick={() => setOpen(false)} style={{ marginLeft: "auto", fontSize }}>×</button>
      </div>

      {decision === "rejected" && (
        <>
          <div>
            <label className="field-label" style={{ fontSize: "0.7rem", marginBottom: "0.2rem" }}>Issue categories</label>
            <div className="toggle-group">
              {ALL_ISSUE_CODES.map(code => (
                <button key={code} type="button"
                  className={`toggle-pill${selectedCodes.includes(code) ? " active" : ""}`}
                  style={{ fontSize: "0.7rem", padding: "0.15rem 0.4rem" }}
                  onClick={() => setSelectedCodes(prev =>
                    prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
                  )}>
                  {ISSUE_CODE_LABELS[code]}
                </button>
              ))}
            </div>
          </div>
          <div className="field">
            <label className="field-label" style={{ fontSize: "0.7rem" }}>Corrected translation (optional)</label>
            <textarea className="textarea" style={{ height: compact ? "2.5rem" : "3.5rem", fontSize }}
              value={correctedTranslation} onChange={e => setCorrectedTranslation(e.target.value)}
              placeholder="Provide the preferred translation if possible..." />
          </div>

          {canFlagForbidden && (
            <div className="field">
              <label className="field-label" style={{ fontSize: "0.7rem" }}>
                Flag phrases as forbidden (REVIEWER+) — applied to this locale globally
              </label>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "0.3rem", marginBottom: "0.3rem" }}>
                {forbiddenPhrases.map((p) => (
                  <span key={p} style={{
                    display: "inline-flex", alignItems: "center", gap: "0.3rem",
                    padding: "0.15rem 0.5rem", borderRadius: "var(--radius-sm)",
                    background: "var(--danger-bg, #fde2e2)", color: "var(--danger, #c00)",
                    fontSize: "0.7rem", fontWeight: 500,
                  }}>
                    {p}
                    <button type="button" onClick={() =>
                      setForbiddenPhrases((prev) => prev.filter((x) => x !== p))
                    } style={{
                      background: "transparent", border: "none", cursor: "pointer",
                      color: "var(--danger, #c00)", padding: 0, fontSize: "0.8rem", lineHeight: 1,
                    }} aria-label={`Remove ${p}`}>×</button>
                  </span>
                ))}
              </div>
              <div style={{ display: "flex", gap: "0.4rem" }}>
                <input
                  className="input"
                  style={{ fontSize, flex: 1 }}
                  value={forbiddenDraft}
                  onChange={(e) => setForbiddenDraft(e.target.value)}
                  onKeyDown={(e) => {
                    if (e.key === "Enter" || e.key === ",") {
                      e.preventDefault();
                      addForbiddenFromDraft();
                    }
                  }}
                  placeholder='e.g. "Sta pensando" — press Enter to add'
                />
                <button
                  type="button"
                  className="btn btn-sm btn-secondary"
                  onClick={addForbiddenFromDraft}
                  disabled={!forbiddenDraft.trim()}
                  style={{ fontSize }}>
                  Add
                </button>
              </div>
            </div>
          )}
        </>
      )}

      <div className="field">
        <label className="field-label" style={{ fontSize: "0.7rem" }}>Note (optional)</label>
        <input className="input" style={{ fontSize }}
          value={note} onChange={e => setNote(e.target.value)}
          placeholder={decision === "approved" ? "What made this good?" : "What was wrong?"} />
      </div>

      {errMsg && <div style={{ color: "var(--danger, #c00)", fontSize: "0.75rem" }}>{errMsg}</div>}

      <div>
        <button className="btn btn-sm btn-primary" disabled={!decision || submitting} onClick={handleSubmit} style={{ fontSize }}>
          {submitting ? "Submitting..." : "Submit Review"}
        </button>
      </div>
    </div>
  );
}
