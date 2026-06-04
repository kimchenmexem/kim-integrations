import { useState } from "react";
import { runDemoCheck } from "../api/client";

interface DemoResult {
  finalText: string;
  status: string;
  riskLevel: string;
  finalAction: string;
  issues: string[];
  rewriteApplied: boolean;
  semanticResult: any;
  independentResult: any;
  confidence: number;
  beforeRewrite: string;
  disclaimer: string;
}

const STATUS_BADGE: Record<string, string> = {
  SAFE:          "badge-green",
  BORDERLINE:    "badge-amber",
  UNCERTAIN:     "badge-amber",
  NON_COMPLIANT: "badge-red",
};

const RISK_BADGE: Record<string, string> = {
  LOW_RISK:    "badge-green",
  MEDIUM_RISK: "badge-amber",
  HIGH_RISK:   "badge-red",
};

const CLASS_BADGE: Record<string, string> = {
  COMPLIANT:      "badge-green",
  BORDERLINE:     "badge-amber",
  AMBIGUOUS:      "badge-amber",
  "NON-COMPLIANT":"badge-red",
};

export default function DemoChecker() {
  const [inputText, setInputText] = useState("");
  const [locale,    setLocale]    = useState("it-IT");
  const [result,    setResult]    = useState<DemoResult | null>(null);
  const [loading,   setLoading]   = useState(false);
  const [error,     setError]     = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inputText.trim()) return;
    setLoading(true); setError(null); setResult(null);
    try {
      setResult(await runDemoCheck(inputText, locale));
    } catch {
      setError("Compliance check failed. Please try again.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      <div className="alert alert-warn" style={{ fontSize: "0.8125rem" }}>
        <span>⚠</span>
        <span><strong>Demo Mode —</strong> Results are for testing only and should not be used in production.</span>
      </div>

      {/* Input form */}
      <div className="card">
        <div className="card-header"><span className="card-title">Check Marketing Text</span></div>
        <form onSubmit={handleSubmit}>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="field">
              <label className="field-label">Marketing Text</label>
              <textarea className="textarea" style={{ height: "7rem" }}
                value={inputText} onChange={e => setInputText(e.target.value)}
                placeholder="Enter marketing copy in any language…" required />
            </div>
            <div className="field" style={{ maxWidth: "280px" }}>
              <label className="field-label">Target Locale / Regulator</label>
              <select className="select" value={locale} onChange={e => setLocale(e.target.value)}>
                <option value="it-IT">Italian — Italy (ESMA/CySEC)</option>
                <option value="fr-FR">French — France (AMF)</option>
                <option value="nl-NL">Dutch — Netherlands (AFM)</option>
                <option value="nl-BE">Dutch — Belgium (FSMA)</option>
                <option value="fr-BE">French — Belgium (FSMA)</option>
                <option value="es-ES">Spanish — Spain (CNMV)</option>
              </select>
            </div>
            {error && <div className="alert alert-error">{error}</div>}
            <div>
              <button type="submit" className="btn btn-primary" disabled={loading || !inputText.trim()}>
                {loading ? "Running check…" : "Run Compliance Check"}
              </button>
            </div>
          </div>
        </form>
      </div>

      {result && (
        <>
          {/* Summary */}
          <div className="card">
            <div className="card-header"><span className="card-title">Compliance Result</span></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

              {/* Status row */}
              <div style={{ display: "flex", gap: "0.75rem", flexWrap: "wrap", alignItems: "center" }}>
                <span className={`badge ${STATUS_BADGE[result.status] ?? "badge-gray"}`}
                  style={{ fontSize: "0.8125rem", padding: "0.25rem 0.75rem" }}>
                  {result.status.replace("_", " ")}
                </span>
                <span className={`badge ${RISK_BADGE[result.riskLevel] ?? "badge-gray"}`}
                  style={{ fontSize: "0.8125rem", padding: "0.25rem 0.75rem" }}>
                  {result.riskLevel.replace("_", " ")}
                </span>
                <span className="badge badge-gray" style={{ fontSize: "0.8125rem", padding: "0.25rem 0.75rem" }}>
                  {result.finalAction.replace(/_/g, " ")}
                </span>
                <span className="badge badge-gray" style={{ fontSize: "0.8125rem", padding: "0.25rem 0.75rem" }}>
                  Confidence {result.confidence}%
                </span>
              </div>

              {/* Issues */}
              {result.issues?.length > 0 && (
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-3)", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Issues Detected
                  </div>
                  <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
                    {result.issues.map((issue, i) => (
                      <span key={i} className="badge badge-red">{issue}</span>
                    ))}
                  </div>
                </div>
              )}

              {/* Output text */}
              <div>
                <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-3)", marginBottom: "0.375rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                  {result.rewriteApplied ? "Rewritten Text" : "Final Text"}
                </div>
                <div style={{
                  padding: "0.875rem 1rem",
                  background: "var(--bg)",
                  border: "1px solid var(--border)",
                  borderRadius: "var(--radius)",
                  fontSize: "0.9375rem",
                  lineHeight: "1.6",
                  whiteSpace: "pre-wrap",
                  color: "var(--text)",
                }}>
                  {result.finalText}
                </div>
              </div>
            </div>
          </div>

          {/* Validator detail */}
          <div className="card">
            <div className="card-header"><span className="card-title">Decision Transparency</span></div>
            <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
              <div className="compliance-grid">
                <div className="compliance-validator">
                  <div className="compliance-validator-title">Semantic Validator</div>
                  <div className="compliance-validator-row">
                    Classification: <span className={`badge ${CLASS_BADGE[result.semanticResult.classification] ?? "badge-gray"}`}>
                      {result.semanticResult.classification}
                    </span>
                  </div>
                  <div className="compliance-validator-row" style={{ marginTop: "0.375rem" }}>
                    Confidence: <strong>{result.semanticResult.confidence}%</strong>
                  </div>
                  {result.semanticResult.issues?.length > 0 && (
                    <div style={{ marginTop: "0.375rem", fontSize: "0.8125rem", color: "var(--text-3)" }}>
                      {result.semanticResult.issues.join(" · ")}
                    </div>
                  )}
                  {result.semanticResult.explanation && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "var(--text-3)", lineHeight: "1.5" }}>
                      {result.semanticResult.explanation}
                    </div>
                  )}
                </div>

                <div className="compliance-validator">
                  <div className="compliance-validator-title">Independent Validator</div>
                  <div className="compliance-validator-row">
                    Classification: <span className={`badge ${CLASS_BADGE[result.independentResult.classification] ?? "badge-gray"}`}>
                      {result.independentResult.classification}
                    </span>
                  </div>
                  <div className="compliance-validator-row" style={{ marginTop: "0.375rem" }}>
                    Confidence: <strong>{result.independentResult.confidence}%</strong>
                  </div>
                  {result.independentResult.violations?.length > 0 && (
                    <div style={{ marginTop: "0.375rem", fontSize: "0.8125rem", color: "var(--text-3)" }}>
                      {result.independentResult.violations.join(" · ")}
                    </div>
                  )}
                  {result.independentResult.reasoning && (
                    <div style={{ marginTop: "0.5rem", fontSize: "0.8125rem", color: "var(--text-3)", lineHeight: "1.5" }}>
                      {result.independentResult.reasoning}
                    </div>
                  )}
                </div>
              </div>

              {result.rewriteApplied && (
                <div>
                  <div style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-3)", marginBottom: "0.5rem", textTransform: "uppercase", letterSpacing: "0.05em" }}>
                    Original (before rewrite)
                  </div>
                  <div style={{
                    padding: "0.875rem 1rem",
                    background: "var(--red-bg)",
                    border: "1px solid #FECDCA",
                    borderRadius: "var(--radius)",
                    fontSize: "0.875rem",
                    lineHeight: "1.6",
                    whiteSpace: "pre-wrap",
                    color: "var(--text)",
                  }}>
                    {result.beforeRewrite}
                  </div>
                </div>
              )}
            </div>
          </div>

          {/* Disclaimer */}
          <div style={{
            textAlign: "center",
            fontSize: "0.8125rem",
            color: "var(--text-3)",
            padding: "0.5rem",
          }}>
            {result.disclaimer}
          </div>
        </>
      )}
    </div>
  );
}
