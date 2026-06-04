/**
 * Campaign Generator — paste a campaign brief, get ready-to-publish copy
 * for every platform's asset slots in one shot.
 *
 * One OpenAI call on the backend; the response is rendered as one card
 * per platform with all variants visible. Each variant has a Copy button
 * and a character-count badge.
 */

import { useEffect, useState } from "react";
import {
  getCampaignCatalogue,
  generateCampaign,
  type CampaignResult,
  type CampaignPlatform,
} from "../api/client";

const SUPPORTED_LOCALES = [
  { code: "it-IT", label: "Italian — Italy" },
  { code: "fr-FR", label: "French — France" },
  { code: "nl-NL", label: "Dutch — Netherlands" },
  { code: "nl-BE", label: "Dutch — Belgium" },
  { code: "fr-BE", label: "French — Belgium" },
  { code: "es-ES", label: "Spanish — Spain" },
  { code: "en-GB", label: "English — United Kingdom" },
];

const TONES = ["Professional", "Friendly", "Confident", "Approachable", "Premium", "Persuasive", "Educational", "Direct"];

export default function CampaignGenerator() {
  const [brief, setBrief] = useState("");
  const [locale, setLocale] = useState("en-GB");
  const [persona, setPersona] = useState("");
  const [tone, setTone] = useState("");
  const [selectedPlatforms, setSelectedPlatforms] = useState<string[]>([]);
  const [catalogue, setCatalogue] = useState<CampaignPlatform[]>([]);

  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [result, setResult] = useState<CampaignResult | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  useEffect(() => {
    getCampaignCatalogue()
      .then(setCatalogue)
      .catch(() => { /* fall back to letting backend decide */ });
  }, []);

  const togglePlatform = (id: string) => {
    setSelectedPlatforms((prev) =>
      prev.includes(id) ? prev.filter((p) => p !== id) : [...prev, id]
    );
  };

  const handleGenerate = async () => {
    if (brief.trim().length < 10) {
      setErr("Please write a slightly longer brief (10+ characters).");
      return;
    }
    setLoading(true);
    setErr(null);
    setResult(null);
    try {
      const r = await generateCampaign({
        brief: brief.trim(),
        locale,
        persona: persona.trim() || undefined,
        tone: tone.trim() || undefined,
        platforms: selectedPlatforms.length > 0 ? selectedPlatforms : undefined,
      });
      setResult(r);
    } catch (e: any) {
      const raw = e?.response?.data?.error;
      setErr(typeof raw === "string" ? raw : e?.message ?? "Campaign generation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopied(key);
    setTimeout(() => setCopied(null), 1200);
  };

  const totalVariants = result?.platforms.reduce(
    (sum, p) => sum + p.assets.reduce((s, a) => s + a.variants.length, 0),
    0
  );

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
      {/* Brief input */}
      <div className="card">
        <div className="card-header"><span className="card-title">Campaign brief</span></div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
          <label className="field-label" style={{ fontSize: "0.75rem" }}>
            What are you promoting? Describe the product, offer, audience, key points.
          </label>
          <textarea
            className="textarea"
            value={brief}
            onChange={(e) => setBrief(e.target.value)}
            placeholder="e.g. We're launching a new low-cost ETF for European retail investors. Focus on transparency, no hidden fees, regulated platform. Audience is first-time investors."
            rows={5}
            style={{ fontSize: "0.875rem" }}
          />
          <div style={{ color: "var(--text-3)", fontSize: "0.7rem", textAlign: "right" }}>{brief.length}/5000</div>

          <div style={{ display: "grid", gap: "0.5rem", gridTemplateColumns: "repeat(auto-fit, minmax(180px, 1fr))" }}>
            <div className="field">
              <label className="field-label" style={{ fontSize: "0.7rem" }}>Locale *</label>
              <select className="input" value={locale} onChange={(e) => setLocale(e.target.value)}>
                {SUPPORTED_LOCALES.map((l) => <option key={l.code} value={l.code}>{l.label}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" style={{ fontSize: "0.7rem" }}>Tone (optional)</label>
              <select className="input" value={tone} onChange={(e) => setTone(e.target.value)}>
                <option value="">(auto)</option>
                {TONES.map((t) => <option key={t} value={t}>{t}</option>)}
              </select>
            </div>
            <div className="field">
              <label className="field-label" style={{ fontSize: "0.7rem" }}>Audience / persona (optional)</label>
              <input
                className="input"
                value={persona}
                onChange={(e) => setPersona(e.target.value)}
                placeholder="e.g. First-time investors, age 25-40"
              />
            </div>
          </div>

          {catalogue.length > 0 && (
            <div>
              <label className="field-label" style={{ fontSize: "0.7rem", marginBottom: "0.3rem", display: "block" }}>
                Platforms (default: all)
              </label>
              <div className="toggle-group">
                {catalogue.map((p) => (
                  <button
                    key={p.id}
                    type="button"
                    className={`toggle-pill${selectedPlatforms.includes(p.id) ? " active" : ""}`}
                    onClick={() => togglePlatform(p.id)}
                    style={{ fontSize: "0.75rem" }}>
                    {p.name}
                  </button>
                ))}
              </div>
            </div>
          )}

          {err && <div style={{ color: "var(--danger, #c00)", fontSize: "0.85rem" }}>{err}</div>}

          <div>
            <button
              className="btn btn-primary"
              onClick={handleGenerate}
              disabled={loading || brief.trim().length < 10}>
              {loading ? "Generating…" : "Generate campaign copy"}
            </button>
            {loading && <span style={{ marginLeft: "0.75rem", color: "var(--text-3)", fontSize: "0.8rem" }}>
              30–60 seconds — producing copy for {selectedPlatforms.length || catalogue.length || "all"} platform(s).
            </span>}
          </div>
        </div>
      </div>

      {/* Results — one card per platform */}
      {result && (
        <>
          <div style={{ display: "flex", alignItems: "center", gap: "0.75rem", marginTop: "0.5rem", flexWrap: "wrap" }}>
            <h3 style={{ margin: 0, fontSize: "1rem", fontWeight: 600 }}>Generated campaign</h3>
            <span className="badge badge-gray">{result.language} ({result.locale})</span>
            <span className="badge badge-gray">{result.platforms.length} platform{result.platforms.length === 1 ? "" : "s"}</span>
            <span className="badge badge-gray">{totalVariants} variant{totalVariants === 1 ? "" : "s"} total</span>
            <span style={{ marginLeft: "auto", color: "var(--text-3)", fontSize: "0.75rem" }}>
              Generated {new Date(result.generatedAt).toLocaleString()}
            </span>
          </div>

          {result.platforms.map((p) => (
            <div key={p.id} className="card">
              <div className="card-header">
                <span className="card-title">{p.name}</span>
                <span style={{ color: "var(--text-3)", fontSize: "0.75rem" }}>
                  {p.assets.reduce((s, a) => s + a.variants.length, 0)} variants across {p.assets.length} slot{p.assets.length === 1 ? "" : "s"}
                </span>
              </div>
              <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "0.75rem" }}>
                {p.assets.map((a) => (
                  <div key={a.format}>
                    <div style={{ display: "flex", alignItems: "baseline", gap: "0.5rem", marginBottom: "0.3rem", flexWrap: "wrap" }}>
                      <strong style={{ fontSize: "0.8rem" }}>{a.label}</strong>
                      <span style={{ color: "var(--text-3)", fontSize: "0.7rem" }}>max {a.maxChars} chars</span>
                    </div>
                    {a.variants.length === 0
                      ? <div style={{ fontSize: "0.75rem", color: "var(--text-3)", fontStyle: "italic" }}>(model returned no variants for this slot)</div>
                      : (
                        <div style={{ display: "flex", flexDirection: "column", gap: "0.35rem" }}>
                          {a.variants.map((v, i) => {
                            const key = `${p.id}:${a.format}:${i}`;
                            const overLimit = v.length > a.maxChars;
                            return (
                              <div key={key} style={{
                                display: "flex",
                                gap: "0.5rem",
                                alignItems: "center",
                                padding: "0.4rem 0.6rem",
                                background: "var(--bg, #f7f8fa)",
                                borderRadius: "var(--radius-sm)",
                                fontSize: "0.85rem",
                              }}>
                                <span style={{ flex: 1, whiteSpace: "pre-wrap", color: overLimit ? "var(--danger, #c00)" : "var(--text-1)" }}>
                                  {v}
                                </span>
                                <span style={{
                                  fontSize: "0.7rem",
                                  color: overLimit ? "var(--danger, #c00)" : "var(--text-3)",
                                  fontVariantNumeric: "tabular-nums",
                                  minWidth: "60px",
                                  textAlign: "right",
                                }}>
                                  {v.length}/{a.maxChars}
                                </span>
                                <button
                                  className="btn btn-sm btn-secondary"
                                  onClick={() => handleCopy(v, key)}
                                  style={{ fontSize: "0.7rem", padding: "0.15rem 0.5rem", flexShrink: 0 }}>
                                  {copied === key ? "Copied" : "Copy"}
                                </button>
                              </div>
                            );
                          })}
                        </div>
                      )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </>
      )}
    </div>
  );
}
