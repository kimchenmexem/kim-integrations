/**
 * QuickTranslate — simple translate-only tool.
 *
 * Paste text, pick one or more target locales (language + country together),
 * get the translated text back. No compliance, no quality gate, no framing.
 */

import { useState } from "react";
import { api } from "../api/client";
import ReviewPanel from "./ReviewPanel";
import HistoryPanel from "./HistoryPanel";

const LOCALES: Array<{ code: string; label: string }> = [
  { code: "it-IT", label: "Italian — Italy" },
  { code: "fr-FR", label: "French — France" },
  { code: "nl-NL", label: "Dutch — Netherlands" },
  { code: "nl-BE", label: "Dutch — Belgium" },
  { code: "fr-BE", label: "French — Belgium" },
  { code: "es-ES", label: "Spanish — Spain" },
  { code: "en-GB", label: "English — United Kingdom" },
];

// Use the shared axios client from ../api/client. It already:
//   - respects VITE_API_BASE_URL (Vercel → Render in production)
//   - attaches the Clerk session token via the AuthTokenBridge
// Previously this component instantiated its own axios with baseURL =
// window.location.origin and no Clerk interceptor, which 404'd on Vercel
// in production and would have 401'd even with the right URL.

interface TranslationResult {
  locale: string;
  language: string;
  country: string;
  translatedText: string;
  charCount: number;
  outputId?: number;
  jobId?: number;
}

export default function QuickTranslate() {
  const [text, setText] = useState("");
  const [selected, setSelected] = useState<string[]>(["it-IT"]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [results, setResults] = useState<TranslationResult[] | null>(null);
  const [copied, setCopied] = useState<string | null>(null);

  const toggle = (code: string) => {
    setSelected(prev =>
      prev.includes(code) ? prev.filter(c => c !== code) : [...prev, code]
    );
  };

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!text.trim() || selected.length === 0) return;
    setLoading(true);
    setError(null);
    setResults(null);
    try {
      // 120s timeout — quick translate can fan out to up to 7 parallel OpenAI
      // calls (one per locale); the shared client's 30s default isn't enough.
      const { data } = await api.post("/api/translate/quick", { text, locales: selected }, { timeout: 120000 });
      setResults(data.translations);
    } catch (err: any) {
      const raw = err?.response?.data?.error;
      setError(typeof raw === "string" ? raw : Array.isArray(raw) ? raw.map((e: any) => e.message ?? JSON.stringify(e)).join("; ") : "Translation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (t: string, locale: string) => {
    navigator.clipboard.writeText(t);
    setCopied(locale);
    setTimeout(() => setCopied(null), 2000);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
      <form onSubmit={submit} style={{ display: "contents" }}>
        {/* Input */}
        <div className="card">
          <div className="card-header"><span className="card-title">Source</span></div>
          <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
            <div className="field">
              <label className="field-label">Text to translate</label>
              <textarea
                className="textarea"
                style={{ height: "8rem" }}
                value={text}
                onChange={e => setText(e.target.value)}
                placeholder="Paste or type the text you want to translate…"
                required
                maxLength={5000}
              />
              <span className="field-hint">{text.length}/5000 characters</span>
            </div>

            <div className="field">
              <label className="field-label">Target languages <span style={{ fontWeight: 400, color: "var(--text-3)" }}>(select one or more)</span></label>
              <div className="toggle-group" style={{ flexWrap: "wrap" }}>
                {LOCALES.map(l => (
                  <button
                    key={l.code}
                    type="button"
                    className={`toggle-pill${selected.includes(l.code) ? " active" : ""}`}
                    onClick={() => toggle(l.code)}
                  >
                    {l.label}
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>

        {error && <div className="alert alert-error">{error}</div>}

        <div>
          <button type="submit" className="btn btn-primary" disabled={loading || !text.trim() || selected.length === 0}>
            {loading ? "Translating…" : `Translate into ${selected.length} language${selected.length !== 1 ? "s" : ""}`}
          </button>
        </div>
      </form>

      {/* Results */}
      {results && results.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: "0.875rem" }}>
          <h3 style={{ fontSize: "1rem", fontWeight: 600, margin: 0 }}>Translations</h3>
          {results.map(r => (
            <div key={r.locale} className="output-card">
              <div className="output-card-header">
                <div style={{ display: "flex", alignItems: "center", gap: "0.5rem" }}>
                  <span style={{ fontWeight: 600, fontSize: "0.875rem" }}>{r.language}</span>
                  <span className="badge badge-gray">{r.country}</span>
                  <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>{r.charCount} chars</span>
                </div>
                <button
                  className="btn btn-sm btn-secondary"
                  style={copied === r.locale ? { color: "var(--green)" } : {}}
                  onClick={() => handleCopy(r.translatedText, r.locale)}
                >
                  {copied === r.locale ? "Copied" : "Copy"}
                </button>
              </div>
              <div className="output-card-body">{r.translatedText}</div>
              {r.outputId && <ReviewPanel outputId={r.outputId} />}
              {r.outputId && <HistoryPanel outputId={r.outputId} />}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
