/**
 * ComplianceCheck — standalone compliance check UI.
 *
 * Paste text + pick locale → get a compliance decision.
 * No translation. No rewrite. No publisher/market-intelligence mixing.
 *
 * Reuses the existing backend endpoint POST /api/compliance/check.
 */

import { useState } from "react";
import ReviewPanel from "./ReviewPanel";
import * as compliance from "../api/compliance";

const LOCALES: Array<{ code: string; label: string }> = [
  { code: "it-IT", label: "Italian (Italy)" },
  { code: "fr-FR", label: "French (France)" },
  { code: "nl-NL", label: "Dutch (Netherlands)" },
  { code: "nl-BE", label: "Dutch (Belgium)" },
  { code: "fr-BE", label: "French (Belgium)" },
  { code: "es-ES", label: "Spanish (Spain)" },
  { code: "en-GB", label: "English (UK)" },
];

export default function ComplianceCheck() {
  const [text, setText] = useState("");
  const [locale, setLocale] = useState("en-GB");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<any | null>(null);
  // Snapshot of the text the user actually submitted, used to highlight the
  // exact fragments the bundle executor matched. Kept separate from `text`
  // so editing the textarea after a check doesn't mis-align the highlights.
  const [checkedText, setCheckedText] = useState("");

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const submitted = text;
      const r = await compliance.runComplianceCheck({ text: submitted, locale });
      setResult(r);
      setCheckedText(submitted);
    } catch (err: any) {
      const raw = err?.response?.data?.error;
      setError(
        typeof raw === "string"
          ? raw
          : Array.isArray(raw)
            ? raw.map((e: any) => e.message ?? JSON.stringify(e)).join("; ")
            : err?.message ?? "Compliance check failed."
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      {/* Form */}
      <form onSubmit={submit} style={{ display: "contents" }}>
        <div className="card">
          <div className="card-header">
            <span className="card-title">Check</span>
          </div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="field">
              <label className="field-label">Target locale / country</label>
              <select className="select" value={locale} onChange={e => setLocale(e.target.value)}>
                {LOCALES.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label">Source text</label>
              <textarea
                className="textarea"
                style={{ height: "10rem" }}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste marketing copy to check against the target locale's compliance bundle…"
                required
                maxLength={10000}
              />
              <span className="field-hint">{text.length}/10000 characters — no translation is performed.</span>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div>
          <button type="submit" className="btn btn-primary" disabled={loading || !text.trim()}>
            {loading ? "Checking…" : "Run compliance check"}
          </button>
        </div>
      </form>

      {/* Result */}
      {result && <ResultCard result={result} checkedText={checkedText} />}
    </div>
  );
}

function ResultCard({ result, checkedText }: { result: any; checkedText: string }) {
  const status = result.status as "approved" | "review_required" | "rejected";
  const statusColor =
    status === "approved" ? "badge-green" :
    status === "rejected" ? "badge-red" : "badge-amber";

  const riskColor =
    result.riskLevel === "critical" || result.riskLevel === "high" ? "badge-red" :
    result.riskLevel === "medium" ? "badge-amber" : "badge-gray";

  const actionColor =
    result.recommendedAction === "publish_as_is" ? "badge-green" :
    result.recommendedAction === "do_not_publish" ? "badge-red" : "badge-amber";

  return (
    <div className="card">
      <div className="card-header">
        <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
          <span className="card-title">Result</span>
          <span className={`badge ${statusColor}`} style={{ fontWeight: 700 }}>
            {status.replace("_", " ").toUpperCase()}
          </span>
          <span className={`badge ${riskColor}`}>Risk: {result.riskLevel}</span>
          <span className={`badge ${actionColor}`}>{result.recommendedAction.replace(/_/g, " ")}</span>
          {result.needsHumanReview && <span className="badge badge-amber">Human review</span>}
          {typeof result.confidence === "number" && (
            <span className="badge badge-gray">Confidence {Math.round(result.confidence)}%</span>
          )}
        </div>
      </div>

      <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem", fontSize: "0.8125rem" }}>
        {/* Summary */}
        <div>
          <div style={{ fontWeight: 600, color: "var(--text-3)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>SUMMARY</div>
          <div>{result.summary}</div>
        </div>

        {/* Dedup'd list of every offending phrase, surfaced as the very first
            thing under SUMMARY so "what's wrong here?" has a one-glance
            answer that doesn't require scanning the full text. */}
        <ProblematicPhrasesPanel
          matchedRules={Array.isArray(result.matchedRules) ? result.matchedRules : []}
        />

        {/* Source text with inline highlights of every matched fragment.
            Only rendered when there is at least one finding to highlight; an
            approved check shows the bare text without colored marks. */}
        {checkedText && (
          <HighlightedSourceText
            text={checkedText}
            matchedRules={Array.isArray(result.matchedRules) ? result.matchedRules : []}
          />
        )}

        {/* Meta row */}
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "0.75rem" }}>
          <Meta label="Locale" value={`${result.locale}${result.country ? ` — ${result.country}` : ""}`} />
          <Meta label="Bundle" value={result.bundleVersion ?? "(legacy fallback)"} />
          <Meta label="Regulators" value={(result.regulatorsApplied ?? []).join(", ") || "—"} />
        </div>

        {/* Issues list */}
        {Array.isArray(result.issues) && result.issues.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, color: "var(--text-3)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
              ISSUES ({result.issues.length})
            </div>
            <ul style={{ marginLeft: "1.25rem" }}>
              {result.issues.map((i: string, idx: number) => <li key={idx}>{i}</li>)}
            </ul>
          </div>
        )}

        {/* Matched rules — human-readable */}
        {Array.isArray(result.matchedRules) && result.matchedRules.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, color: "var(--text-3)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
              FINDINGS ({result.matchedRules.length})
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: "0.625rem" }}>
              {result.matchedRules.map((r: any, i: number) => (
                <FindingCard key={i} rule={r} />
              ))}
            </div>
          </div>
        )}

        {/* Source refs */}
        {Array.isArray(result.sourceRefs) && result.sourceRefs.length > 0 && (
          <div>
            <div style={{ fontWeight: 600, color: "var(--text-3)", fontSize: "0.75rem", marginBottom: "0.25rem" }}>
              SOURCE REFERENCES
            </div>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
              {result.sourceRefs.map((r: any, i: number) => (
                <span key={i} className="badge badge-blue">
                  {r.sourceCode}{r.documentRef ? ` / ${r.documentRef}` : ""}
                </span>
              ))}
            </div>
          </div>
        )}

        {/* Provenance */}
        <div style={{ color: "var(--text-3)", fontSize: "0.6875rem", paddingTop: "0.375rem", borderTop: "1px solid var(--border)" }}>
          Checked at {new Date(result.checkedAt).toLocaleString()} —
          {result.bundleVersion
            ? ` decision from published bundle ${result.bundleVersion}.`
            : " decision from legacy fallback rules (no published bundle for this locale)."}
        </div>

        {/* Feedback — was the compliance assessment correct? */}
        {result.outputId && <ReviewPanel outputId={result.outputId} />}
      </div>
    </div>
  );
}

// ─── Human-readable rule display ────────────────────────────────────

const TYPE_LABELS: Record<string, { label: string; description: string }> = {
  banned_phrase:        { label: "Prohibited phrase",          description: "A specific phrase that is not allowed under the applicable regulations was found in the text." },
  regex:                { label: "Pattern match",              description: "A pattern of words matching a known regulatory violation was detected." },
  required_disclaimer:  { label: "Missing required disclosure", description: "The text mentions a topic (e.g. returns, performance) that requires an accompanying risk disclosure, but the disclosure was not found." },
  llm_semantic:         { label: "Content review",             description: "An automated review of the overall content flagged a potential concern. This is an interpretation, not a hard rule match." },
  llm_independent:      { label: "Strict review",              description: "A separate, conservative automated review flagged a potential concern. This reviewer is intentionally cautious and may flag text that is actually compliant." },
};

const SEVERITY_LABELS: Record<string, { label: string; color: string; description: string }> = {
  critical: { label: "Critical", color: "badge-red",   description: "Clear regulatory violation — must be fixed before publishing." },
  major:    { label: "Major",    color: "badge-amber",  description: "Significant concern — should be reviewed by a qualified person." },
  minor:    { label: "Low",      color: "badge-gray",   description: "Minor observation — likely acceptable but flagged for awareness." },
};

function expandMessage(type: string, message: string): string {
  // If the message is a bare category label (e.g. "guarantees"), expand it
  const EXPANSIONS: Record<string, string> = {
    guarantees:        "The text may contain language that could be interpreted as implying guaranteed outcomes or capital safety.",
    urgency:           "The text may create a sense of urgency or scarcity that could pressure the reader.",
    authority:         "The text may make unsupported claims of authority, superiority, or market leadership.",
    promotional:       "The text may use overly promotional language that does not meet the standard of fair, clear and not misleading.",
    suitability:       "The text may imply the product is suitable for all investors without qualification.",
    "risk balance":    "The text mentions benefits or returns without proportionate risk disclosure.",
  };
  const lower = message.toLowerCase().trim();
  return EXPANSIONS[lower] ?? message;
}

// ─── Problematic-phrases summary panel ──────────────────────────────
//
// Renders a deduplicated list of every offending phrase the bundle +
// LLM check matched against the user's text. Each phrase is shown as a
// severity-coloured chip with the category beneath, so the answer to
// "what's wrong in my text?" is a single glance, not a scroll-through.

interface PhraseChip {
  phrase: string;
  severity: string;
  categories: string[];
}

function summariseOffendingPhrases(matchedRules: any[]): PhraseChip[] {
  const byPhrase = new Map<string, PhraseChip>();
  for (const r of matchedRules) {
    const ev: string = typeof r.evidence === "string" ? r.evidence.trim() : "";
    if (!ev) continue;
    const key = ev.toLowerCase();
    const sev = (r.severity ?? "minor") as string;
    const cat = r.message || r.type || "rule";
    const existing = byPhrase.get(key);
    if (existing) {
      // Keep the higher-severity rendering when the same phrase fires
      // multiple categories; record every category for the tooltip.
      const a = SEVERITY_RANK[existing.severity] ?? 0;
      const b = SEVERITY_RANK[sev] ?? 0;
      if (b > a) existing.severity = sev;
      if (!existing.categories.includes(cat)) existing.categories.push(cat);
    } else {
      byPhrase.set(key, { phrase: ev, severity: sev, categories: [cat] });
    }
  }
  return Array.from(byPhrase.values());
}

function ProblematicPhrasesPanel({ matchedRules }: { matchedRules: any[] }) {
  const phrases = summariseOffendingPhrases(matchedRules);
  if (phrases.length === 0) return null;

  return (
    <div style={{
      padding: "0.75rem 0.9rem",
      background: "rgba(220, 38, 38, 0.05)",
      border: "1px solid rgba(220, 38, 38, 0.25)",
      borderRadius: "var(--radius-sm)",
    }}>
      <div style={{ fontWeight: 600, color: "var(--text-3)", fontSize: "0.75rem", marginBottom: "0.5rem" }}>
        PROBLEMATIC PHRASES IN YOUR TEXT ({phrases.length})
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
        {phrases.map((p, i) => {
          const style = SEVERITY_STYLE[p.severity] ?? SEVERITY_STYLE.minor;
          return (
            <span
              key={`${p.phrase}-${i}`}
              title={p.categories.join(" · ")}
              style={{
                display: "inline-flex",
                alignItems: "center",
                gap: "0.35rem",
                padding: "0.25rem 0.55rem",
                background: style.bg,
                color: style.text,
                borderBottom: `2px solid ${style.border}`,
                borderRadius: "var(--radius-sm)",
                fontWeight: 600,
                fontSize: "0.8125rem",
              }}>
              "{p.phrase}"
              <span style={{
                fontSize: "0.65rem",
                fontWeight: 400,
                opacity: 0.85,
                textTransform: "uppercase",
                letterSpacing: "0.02em",
              }}>
                {p.severity}
              </span>
            </span>
          );
        })}
      </div>
    </div>
  );
}

// ─── Inline highlight of evidence words in the submitted text ───────
//
// Builds a non-overlapping, case-insensitive set of ranges covering every
// fragment the bundle executor matched, picks the highest-severity color
// per range, and renders the text with <mark>-style spans. Missing-
// disclaimer findings have no `evidence`, so they surface as separate
// banners under the highlighted block.

const SEVERITY_RANK: Record<string, number> = { critical: 3, major: 2, minor: 1 };
const SEVERITY_STYLE: Record<string, { bg: string; border: string; text: string }> = {
  critical: { bg: "rgba(220, 38, 38, 0.18)",  border: "var(--red, #c00)",   text: "var(--red, #c00)" },
  major:    { bg: "rgba(217, 119, 6, 0.18)",  border: "var(--amber, #d97706)", text: "var(--amber, #d97706)" },
  minor:    { bg: "rgba(107, 114, 128, 0.18)", border: "var(--text-3, #6b7280)", text: "var(--text-3, #6b7280)" },
};

interface Range {
  start: number;
  end: number;
  severity: string;
  evidence: string;
  message: string;
}

function findRanges(text: string, evidence: string, severity: string, message: string): Range[] {
  if (!evidence || !text) return [];
  const lowerText = text.toLowerCase();
  const lowerEv = evidence.toLowerCase();
  const out: Range[] = [];
  let idx = 0;
  while (idx < lowerText.length) {
    const found = lowerText.indexOf(lowerEv, idx);
    if (found === -1) break;
    out.push({
      start: found,
      end: found + lowerEv.length,
      severity,
      evidence,
      message,
    });
    idx = found + Math.max(1, lowerEv.length);
  }
  return out;
}

/** Merge overlapping ranges keeping the highest severity per merged span. */
function mergeRanges(ranges: Range[]): Range[] {
  if (ranges.length === 0) return [];
  const sorted = [...ranges].sort((a, b) => a.start - b.start || b.end - a.end);
  const merged: Range[] = [];
  for (const r of sorted) {
    const last = merged[merged.length - 1];
    if (last && r.start < last.end) {
      // Overlap: extend end and keep the higher-severity attributes.
      const lastRank = SEVERITY_RANK[last.severity] ?? 0;
      const curRank = SEVERITY_RANK[r.severity] ?? 0;
      if (curRank > lastRank) {
        last.severity = r.severity;
        last.evidence = r.evidence;
        last.message = r.message;
      }
      if (r.end > last.end) last.end = r.end;
    } else {
      merged.push({ ...r });
    }
  }
  return merged;
}

function HighlightedSourceText({ text, matchedRules }: { text: string; matchedRules: any[] }) {
  // Hard rules with text evidence → inline highlight.
  // Disclaimer rules have no evidence; they're handled below as banners.
  const evidenceRules = matchedRules.filter(
    (r) => r.evidence && typeof r.evidence === "string" && r.evidence.trim().length > 0,
  );
  const missingDisclaimers = matchedRules.filter(
    (r) => r.type === "required_disclaimer" && (!r.evidence || r.evidence === ""),
  );

  // Compute and merge ranges.
  const allRanges: Range[] = [];
  for (const r of evidenceRules) {
    allRanges.push(...findRanges(text, r.evidence, r.severity ?? "minor", r.message ?? ""));
  }
  const ranges = mergeRanges(allRanges);

  // Build output spans by walking the text.
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  for (let i = 0; i < ranges.length; i++) {
    const r = ranges[i];
    if (r.start > cursor) {
      nodes.push(<span key={`t-${i}`}>{text.slice(cursor, r.start)}</span>);
    }
    const style = SEVERITY_STYLE[r.severity] ?? SEVERITY_STYLE.minor;
    nodes.push(
      <mark
        key={`m-${i}`}
        title={r.message ? `${r.severity.toUpperCase()}: ${r.message}` : r.severity.toUpperCase()}
        style={{
          background: style.bg,
          color: style.text,
          borderBottom: `2px solid ${style.border}`,
          padding: "0 2px",
          borderRadius: "2px",
        }}>
        {text.slice(r.start, r.end)}
      </mark>,
    );
    cursor = r.end;
  }
  if (cursor < text.length) {
    nodes.push(<span key="tail">{text.slice(cursor)}</span>);
  }

  const noFindings = ranges.length === 0 && missingDisclaimers.length === 0;

  return (
    <div>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: "0.3rem" }}>
        <div style={{ fontWeight: 600, color: "var(--text-3)", fontSize: "0.75rem" }}>
          SOURCE TEXT {ranges.length > 0 && `— ${ranges.length} match${ranges.length === 1 ? "" : "es"} highlighted`}
        </div>
        {ranges.length > 0 && (
          <div style={{ display: "flex", gap: "0.4rem", fontSize: "0.6875rem", color: "var(--text-3)" }}>
            <LegendDot severity="critical" />
            <LegendDot severity="major" />
            <LegendDot severity="minor" />
          </div>
        )}
      </div>

      <div style={{
        whiteSpace: "pre-wrap",
        wordBreak: "break-word",
        padding: "0.75rem 0.9rem",
        background: "var(--bg, #f7f8fa)",
        borderRadius: "var(--radius-sm)",
        border: "1px solid var(--border)",
        fontSize: "0.8125rem",
        lineHeight: 1.5,
        fontFamily: "var(--font-mono, ui-monospace), Menlo, monospace",
      }}>
        {noFindings ? text : nodes}
      </div>

      {/* Missing-disclaimer banners — these have no matched text fragment */}
      {missingDisclaimers.length > 0 && (
        <div style={{ marginTop: "0.5rem", display: "flex", flexDirection: "column", gap: "0.3rem" }}>
          {missingDisclaimers.map((d, i) => (
            <div key={`md-${i}`} style={{
              padding: "0.4rem 0.6rem",
              background: "rgba(217, 119, 6, 0.08)",
              border: "1px dashed var(--amber, #d97706)",
              borderRadius: "var(--radius-sm)",
              fontSize: "0.75rem",
              color: "var(--text-2)",
            }}>
              <strong style={{ color: "var(--amber, #d97706)" }}>Missing disclosure: </strong>
              {d.message}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

function LegendDot({ severity }: { severity: string }) {
  const style = SEVERITY_STYLE[severity];
  return (
    <span style={{ display: "inline-flex", alignItems: "center", gap: "0.25rem" }}>
      <span style={{
        display: "inline-block",
        width: "0.55rem",
        height: "0.55rem",
        borderRadius: "2px",
        background: style.bg,
        borderBottom: `2px solid ${style.border}`,
      }} />
      <span style={{ textTransform: "uppercase", letterSpacing: "0.02em" }}>{severity}</span>
    </span>
  );
}

function FindingCard({ rule }: { rule: any }) {
  const typeInfo = TYPE_LABELS[rule.type] ?? { label: rule.type, description: "" };
  const sevInfo = SEVERITY_LABELS[rule.severity] ?? SEVERITY_LABELS.minor;
  const isHardRule = ["banned_phrase", "regex", "required_disclaimer"].includes(rule.type);
  const hasEvidence = rule.evidence && rule.evidence !== "—" && rule.evidence !== "";
  const expandedMessage = expandMessage(rule.type, rule.message);

  return (
    <div style={{
      padding: "0.75rem",
      background: "var(--bg)",
      borderRadius: "var(--radius-sm)",
      borderLeft: `3px solid ${rule.severity === "critical" ? "var(--red)" : rule.severity === "major" ? "var(--amber)" : "var(--border-md)"}`,
    }}>
      {/* Header row */}
      <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", marginBottom: "0.375rem", flexWrap: "wrap" }}>
        <span style={{ fontWeight: 600, fontSize: "0.8125rem" }}>{typeInfo.label}</span>
        <span className={`badge ${sevInfo.color}`}>{sevInfo.label}</span>
        {rule.sourceCode && <span className="badge badge-blue" style={{ fontSize: "0.6875rem" }}>{rule.sourceCode}</span>}
        {isHardRule && <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>Hard rule</span>}
        {!isHardRule && <span style={{ fontSize: "0.6875rem", color: "var(--text-3)" }}>Automated review</span>}
      </div>

      {/* Explanation */}
      <div style={{ fontSize: "0.8125rem", color: "var(--text-2)", marginBottom: hasEvidence ? "0.375rem" : 0 }}>
        {expandedMessage}
      </div>

      {/* Evidence or "no specific match" */}
      {hasEvidence ? (
        <div style={{ fontSize: "0.75rem", marginTop: "0.25rem" }}>
          <span style={{ color: "var(--text-3)" }}>Found in text: </span>
          <code style={{ background: "var(--red-bg)", padding: "0.125rem 0.375rem", borderRadius: "3px", fontSize: "0.75rem" }}>
            {rule.evidence}
          </code>
        </div>
      ) : (
        <div style={{ fontSize: "0.75rem", color: "var(--text-4)", marginTop: "0.25rem", fontStyle: "italic" }}>
          No specific phrase matched — this finding is based on an overall assessment of the text.
        </div>
      )}

      {/* Type explanation on hover / expandable */}
      {typeInfo.description && (
        <div style={{ fontSize: "0.6875rem", color: "var(--text-4)", marginTop: "0.375rem" }}>
          {typeInfo.description}
        </div>
      )}
    </div>
  );
}

function Meta({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div style={{ fontWeight: 600, color: "var(--text-3)", fontSize: "0.6875rem" }}>{label.toUpperCase()}</div>
      <div style={{ fontSize: "0.8125rem" }}>{value}</div>
    </div>
  );
}

function Th({ children }: { children: React.ReactNode }) {
  return <th style={{ padding: "0.375rem 0.5rem", fontWeight: 600, fontSize: "0.6875rem", color: "var(--text-3)" }}>{children}</th>;
}

function Td({ children }: { children: React.ReactNode }) {
  return <td style={{ padding: "0.375rem 0.5rem", verticalAlign: "top" }}>{children}</td>;
}
