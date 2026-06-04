import { useState } from "react";
import { createTranslation } from "../api/client";
import { LocaleOption, TextTypeOption, PersonaOption, ToneOption, TranslationRequest } from "@mexem/shared";
import ReviewPanel from "./ReviewPanel";
import HistoryPanel from "./HistoryPanel";

interface Props {
  locales: LocaleOption[];
  textTypes: TextTypeOption[];
  personas: PersonaOption[];
  tones: ToneOption[];
}

interface QualityGateInfo {
  score: number;
  approved: boolean;
  stage: string;
  issues: Array<{ code: string; severity: string; message: string }>;
  hardCheckIssues: Array<{ code: string; severity: string; message: string }>;
}

interface OutputCard {
  id?: number;
  version: number;
  outputText: string;
  score?: number;
  validation?: any;
  qualityGate?: QualityGateInfo;
}

const CONTENT_TYPE_LENGTHS: Record<string, { mode: "near" | "max" | "exact"; value: number }> = {
  // ─── Google Search (Responsive Search Ads) ─────────────────────
  google_search_headline:       { mode: "max",  value: 30 },
  google_search_description:    { mode: "max",  value: 90 },

  // ─── Google Display (Responsive Display Ads) ──────────────────
  google_display_headline:      { mode: "max",  value: 30 },
  google_display_long_headline: { mode: "max",  value: 90 },
  google_display_description:   { mode: "max",  value: 90 },

  // ─── Google Performance Max ───────────────────────────────────
  google_pmax_headline:         { mode: "max",  value: 30 },
  google_pmax_long_headline:    { mode: "max",  value: 90 },
  google_pmax_description:      { mode: "max",  value: 90 },

  // ─── YouTube Ads ──────────────────────────────────────────────
  google_youtube_headline:      { mode: "max",  value: 30 },
  google_youtube_description:   { mode: "max",  value: 90 },

  // ─── Meta / Facebook / Instagram ──────────────────────────────
  meta_primary_text:            { mode: "max",  value: 125 },
  meta_headline:                { mode: "max",  value: 40 },
  meta_description:             { mode: "max",  value: 30 },
  meta_long_headline:           { mode: "max",  value: 100 },

  // ─── General / Other ──────────────────────────────────────────
  paid_social:                  { mode: "max",  value: 125 },
  organic_social:               { mode: "max",  value: 280 },
  email_subject:                { mode: "max",  value: 60 },
  email_body:                   { mode: "near", value: 500 },
  push_notification:            { mode: "max",  value: 50 },
  sms:                          { mode: "max",  value: 160 },
  landing_headline:             { mode: "max",  value: 70 },
  banner:                       { mode: "max",  value: 30 },
  cta_button:                   { mode: "max",  value: 25 },
};

function QualityBadge({ qg }: { qg: QualityGateInfo }) {
  const pct = Math.round(qg.score * 100);
  const color = qg.approved ? (pct >= 90 ? "badge-green" : "badge-blue") : "badge-amber";
  const stageLabel = qg.stage === "initial" ? "" : ` (${qg.stage})`;
  return (
    <span className={`badge ${color}`} title={`Quality gate: ${pct}%${stageLabel}`}>
      QG {pct}%{stageLabel}
    </span>
  );
}

export default function TranslationForm({ locales, textTypes, personas, tones }: Props) {
  const [sourceText,      setSourceText]      = useState("");
  const [sourceLanguage,  setSourceLanguage]  = useState("English");
  const [targetLocale,    setTargetLocale]    = useState(locales[0]?.code ?? "it-IT");
  const [textType,        setTextType]        = useState(textTypes[0]?.id ?? "paid_social");
  const [persona,         setPersona]         = useState(personas[0]?.id ?? "beginners");
  const [selectedTones,   setSelectedTones]   = useState<string[]>([tones[0]?.id ?? "professional"]);
  const [outputCount,     setOutputCount]     = useState(1);
  const [requiredTerms,   setRequiredTerms]   = useState("");
  const [forbiddenTerms,  setForbiddenTerms]  = useState("");
  const [complianceNotes, setComplianceNotes] = useState("");
  const [campaignContext, setCampaignContext] = useState("");
  const [lengthMode,      setLengthMode]      = useState<"near"|"max"|"exact">("near");
  const [lengthValue,     setLengthValue]     = useState(120);

  const [outputs,  setOutputs]  = useState<OutputCard[]>([]);
  const [jobId,    setJobId]    = useState<number | null>(null);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState<string | null>(null);
  const [copied,   setCopied]   = useState<number | null>(null);

  const buildRequest = (extra?: Partial<TranslationRequest>): TranslationRequest => ({
    sourceText, sourceLanguage,
    targetLocale: targetLocale as any,
    textType, persona, tone: selectedTones, outputCount,
    lengthConstraint: {
      mode: lengthMode,
      ...(lengthMode === "exact" ? { exactChars: lengthValue } : {}),
      ...(lengthMode === "near"  ? { exactChars: lengthValue } : {}),
      ...(lengthMode === "max"   ? { maxChars:   lengthValue } : {}),
    },
    requiredTerms:   requiredTerms.split(",").map(t => t.trim()).filter(Boolean),
    forbiddenTerms:  forbiddenTerms.split(",").map(t => t.trim()).filter(Boolean),
    complianceNotes: complianceNotes || undefined,
    campaignContext: campaignContext || undefined,
    ...extra,
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!sourceText.trim()) return;
    setLoading(true); setError(null); setOutputs([]); setJobId(null);

    try {
      const result = await createTranslation(buildRequest());
      setJobId(result.jobId);
      setOutputs(result.outputs.map((o: any) => ({
        ...o,
        validation: typeof o.validation === "string" ? JSON.parse(o.validation) : o.validation,
      })));
    } catch (err: any) {
      const raw = err?.response?.data?.error;
      setError(typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((e: any) => e.message ?? JSON.stringify(e)).join("; ") : "Translation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleMoreVersions = async () => {
    if (!sourceText.trim()) return;
    setLoading(true); setError(null);
    const nextVersion = outputs.length + 1;
    try {
      const result = await createTranslation(buildRequest({
        existingVersions: outputs.map(o => o.outputText),
        versionOffset: outputs.length,
      }));
      const newOutputs = result.outputs.map((o: any, i: number) => ({
        ...o,
        version: nextVersion + i,
        validation: typeof o.validation === "string" ? JSON.parse(o.validation) : o.validation,
      }));
      setOutputs(prev => [...prev, ...newOutputs]);
    } catch (err: any) {
      const raw = err?.response?.data?.error;
      setError(typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((e: any) => e.message ?? JSON.stringify(e)).join("; ") : "Translation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, version: number) => {
    navigator.clipboard.writeText(text);
    setCopied(version);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <form onSubmit={handleSubmit} style={{ display: "contents" }}>

        {/* Source */}
        <div className="card">
          <div className="card-header"><span className="card-title">Source Text</span></div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              <div className="field">
                <label className="field-label">Source Language</label>
                <input className="input" value={sourceLanguage} onChange={e => setSourceLanguage(e.target.value)} />
              </div>
              <div className="field">
                <label className="field-label">Target Locale</label>
                <select className="select" value={targetLocale} onChange={e => setTargetLocale(e.target.value as any)}>
                  {locales.map(l => <option key={l.code} value={l.code}>{l.label}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Marketing Copy</label>
              <textarea className="textarea" style={{ height: "8rem" }}
                value={sourceText} onChange={e => setSourceText(e.target.value)}
                placeholder="Enter your marketing text here..." required />
            </div>
          </div>
        </div>

        {/* Options */}
        <div className="card">
          <div className="card-header"><span className="card-title">Localisation Options</span></div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              <div className="field">
                <label className="field-label">Content Type</label>
                <select className="select" value={textType} onChange={e => {
                  const id = e.target.value;
                  setTextType(id);
                  const preset = CONTENT_TYPE_LENGTHS[id];
                  if (preset) { setLengthMode(preset.mode); setLengthValue(preset.value); }
                }}>
                  {textTypes.map(t => <option key={t.id} value={t.id}>{t.label}</option>)}
                </select>
              </div>
              <div className="field">
                <label className="field-label">Persona</label>
                <select className="select" value={persona} onChange={e => setPersona(e.target.value)}>
                  {personas.map(p => <option key={p.id} value={p.id}>{p.label}</option>)}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="field-label">Tone <span style={{ fontWeight: 400, color: "var(--text-3)" }}>(select one or more)</span></label>
              <div className="toggle-group" style={{ flexWrap: "wrap" }}>
                {tones.map(t => (
                  <button key={t.id} type="button"
                    className={`toggle-pill${selectedTones.includes(t.id) ? " active" : ""}`}
                    onClick={() => setSelectedTones(prev =>
                      prev.includes(t.id)
                        ? prev.length > 1 ? prev.filter(x => x !== t.id) : prev
                        : [...prev, t.id]
                    )}>
                    {t.label}
                  </button>
                ))}
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(160px, 1fr))", gap: "1rem" }}>
              <div className="field">
                <label className="field-label">Length Mode</label>
                <select className="select" value={lengthMode} onChange={e => setLengthMode(e.target.value as any)}>
                  <option value="near">Near (chars)</option>
                  <option value="exact">Exact (chars)</option>
                  <option value="max">Max (chars)</option>
                </select>
              </div>
              <div className="field">
                <label className="field-label">Target Length</label>
                <input className="input" type="number" min={20} max={2000}
                  value={lengthValue} onChange={e => setLengthValue(Number(e.target.value))} />
              </div>
              <div className="field">
                <label className="field-label">Versions</label>
                <input className="input" type="number" min={1} max={5}
                  value={outputCount} onChange={e => setOutputCount(Number(e.target.value))} />
              </div>
            </div>
          </div>
        </div>

        {/* Advanced */}
        <div className="card">
          <div className="card-header"><span className="card-title">Advanced Options</span></div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              <div className="field">
                <label className="field-label">Required Terms</label>
                <input className="input" value={requiredTerms} onChange={e => setRequiredTerms(e.target.value)}
                  placeholder="e.g. MEXEM, WisdomTree (comma-separated)" />
                <span className="field-hint">These terms will appear verbatim in the output.</span>
              </div>
              <div className="field">
                <label className="field-label">Forbidden Terms</label>
                <input className="input" value={forbiddenTerms} onChange={e => setForbiddenTerms(e.target.value)}
                  placeholder="e.g. guaranteed, risk-free (comma-separated)" />
              </div>
            </div>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))", gap: "1rem" }}>
              <div className="field">
                <label className="field-label">Campaign Context</label>
                <textarea className="textarea" style={{ height: "4rem" }}
                  value={campaignContext} onChange={e => setCampaignContext(e.target.value)}
                  placeholder="e.g. Q2 ETF awareness campaign — Italy" />
              </div>
              <div className="field">
                <label className="field-label">Compliance Notes</label>
                <textarea className="textarea" style={{ height: "4rem" }}
                  value={complianceNotes} onChange={e => setComplianceNotes(e.target.value)}
                  placeholder="e.g. ESMA disclaimer required" />
              </div>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div>
          <button type="submit" className="btn btn-primary" disabled={loading || !sourceText.trim()}>
            {loading ? "Generating..." : "Generate Localised Copy"}
          </button>
        </div>
      </form>

      {/* Results */}
      {outputs.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem" }}>
            <h3 style={{ fontSize: "1rem", fontWeight: "600", margin: 0 }}>Results</h3>
            {jobId && <span className="badge badge-gray">Job #{jobId}</span>}
          </div>

          {outputs.map((output) => {
            const compliance = output.validation?.compliance;
            const lengthOk   = output.validation?.withinLimit !== false;
            const qg = output.qualityGate;

            return (
              <div key={output.version} className="output-card">
                <div className="output-card-header">
                  <div style={{ display: "flex", alignItems: "center", gap: "0.5rem", flexWrap: "wrap" }}>
                    <span style={{ fontWeight: "600", fontSize: "0.875rem" }}>Version {output.version}</span>
                    {compliance && (
                      <span className={`badge ${compliance.compliant ? "badge-green" : "badge-amber"}`}>
                        {compliance.compliant ? "Compliant" : "Review needed"}
                      </span>
                    )}
                    {qg && <QualityBadge qg={qg} />}
                    {output.score != null && (
                      <span className="badge badge-gray">Score {Math.round(output.score * 100)}%</span>
                    )}
                    {!lengthOk && <span className="badge badge-amber">Length exceeded</span>}
                  </div>
                  <button
                    className={`btn btn-sm ${copied === output.version ? "btn-secondary" : "btn-secondary"}`}
                    style={copied === output.version ? { color: "var(--green)" } : {}}
                    onClick={() => handleCopy(output.outputText, output.version)}>
                    {copied === output.version ? "Copied" : "Copy"}
                  </button>
                </div>

                <div className="output-card-body">{output.outputText}</div>

                {/* Quality gate issues */}
                {qg && (qg.issues.length > 0 || qg.hardCheckIssues.length > 0) && (
                  <div className="output-card-footer">
                    <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-3)" }}>Quality:</span>
                    {qg.hardCheckIssues.map((issue, i) => (
                      <span key={`hc-${i}`} className={`badge ${issue.severity === "critical" ? "badge-red" : "badge-amber"}`}>
                        {issue.code}: {issue.message}
                      </span>
                    ))}
                    {qg.issues.map((issue, i) => (
                      <span key={`qi-${i}`} className={`badge ${issue.severity === "critical" ? "badge-red" : issue.severity === "major" ? "badge-amber" : "badge-gray"}`}
                        title={issue.message}>
                        {issue.code}
                      </span>
                    ))}
                  </div>
                )}

                {/* Compliance issues */}
                {compliance?.issues?.length > 0 && (
                  <div className="output-card-footer">
                    <span style={{ fontSize: "0.75rem", fontWeight: "600", color: "var(--text-3)" }}>Compliance:</span>
                    {compliance.issues.map((issue: string, i: number) => (
                      <span key={i} className="badge badge-amber">{issue}</span>
                    ))}
                  </div>
                )}

                {/* Review panel */}
                {output.id && <ReviewPanel outputId={output.id} />}

                {/* Version history */}
                {output.id && <HistoryPanel outputId={output.id} />}
              </div>
            );
          })}

          <div>
            <button className="btn btn-secondary" onClick={handleMoreVersions} disabled={loading || !sourceText.trim()}>
              {loading ? "Generating..." : `+ ${outputCount} More Version${outputCount !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}
