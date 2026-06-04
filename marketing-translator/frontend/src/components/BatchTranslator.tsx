import { useState } from "react";
import { runBatchTranslation, getTranslationAlternatives } from "../api/client";
import ReviewPanel from "./ReviewPanel";

const LOCALE_LABELS: Record<string, string> = {
  "it-IT": "🇮🇹 IT",
  "fr-FR": "🇫🇷 FR",
  "nl-NL": "🇳🇱 NL",
  "nl-BE": "🇧🇪 BE-NL",
  "fr-BE": "🇧🇪 BE-FR",
  "es-ES": "🇪🇸 ES",
  "en-GB": "🇬🇧 UK",
};
const ALL_LOCALES = Object.keys(LOCALE_LABELS);

interface AdFormat { id: string; label: string; maxChars: number; hint?: string }
const AD_FORMATS: AdFormat[] = [
  // ─── Google Search (RSA) ──────────────────────────────────────
  { id: "google_search_headline",     label: "Google Search — Headline",       maxChars: 30,  hint: "At least one must be ≤15 chars" },
  { id: "google_search_description",  label: "Google Search — Description",    maxChars: 90,  hint: "At least one should be <60 chars" },

  // ─── Google Display ───────────────────────────────────────────
  { id: "google_display_headline",      label: "Google Display — Short Headline", maxChars: 30 },
  { id: "google_display_long_headline", label: "Google Display — Long Headline",  maxChars: 90 },
  { id: "google_display_description",   label: "Google Display — Description",    maxChars: 90 },

  // ─── Google Performance Max ───────────────────────────────────
  { id: "google_pmax_headline",       label: "Google PMax — Headline",        maxChars: 30 },
  { id: "google_pmax_long_headline",  label: "Google PMax — Long Headline",   maxChars: 90 },
  { id: "google_pmax_description",    label: "Google PMax — Description",     maxChars: 90 },

  // ─── YouTube ──────────────────────────────────────────────────
  { id: "google_youtube_headline",    label: "YouTube Ad — Headline",         maxChars: 30 },
  { id: "google_youtube_description", label: "YouTube Ad — Description",      maxChars: 90 },

  // ─── Meta (Facebook / Instagram) ──────────────────────────────
  { id: "meta_primary",         label: "Meta — Primary Text",           maxChars: 125 },
  { id: "meta_headline",        label: "Meta — Headline",               maxChars: 40  },
  { id: "meta_description",     label: "Meta — Link Description",       maxChars: 30  },
  { id: "meta_long_headline",   label: "Meta — Long Headline",          maxChars: 100 },

  // ─── Custom ───────────────────────────────────────────────────
  { id: "custom",               label: "Custom",                        maxChars: 0   },
];

interface TranslationCell {
  text: string;
  qualityGate?: { score: number; approved: boolean; stage: string };
  outputId?: number;
  jobId?: number;
}
interface TranslationRow { source: string; translations: Record<string, string | TranslationCell> }

function getCellText(cell: string | TranslationCell | undefined): string {
  if (!cell) return "";
  if (typeof cell === "string") return cell;
  return cell.text;
}

function getCellOutputId(cell: string | TranslationCell | undefined): number | undefined {
  if (typeof cell !== "object" || cell === null) return undefined;
  return cell.outputId;
}

function getCellQG(cell: string | TranslationCell | undefined): TranslationCell["qualityGate"] | undefined {
  if (!cell || typeof cell === "string") return undefined;
  return cell.qualityGate;
}

export default function BatchTranslator() {
  const [inputText,       setInputText]       = useState("");
  const [selectedFormat,  setSelectedFormat]  = useState("google_search_headline");
  const [customMaxChars,  setCustomMaxChars]  = useState(30);
  const [selectedLocales, setSelectedLocales] = useState<string[]>(["it-IT", "fr-FR", "es-ES"]);
  const [results,         setResults]         = useState<TranslationRow[]>([]);
  const [loading,         setLoading]         = useState(false);
  const [error,           setError]           = useState<string | null>(null);
  const [copiedCell,      setCopiedCell]       = useState<string | null>(null);
  const [alternatives,    setAlternatives]    = useState<Record<string, { loading: boolean; options: string[] }>>({});
  const [editing,         setEditing]         = useState<Record<string, string>>({});

  const format   = AD_FORMATS.find(f => f.id === selectedFormat)!;
  const maxChars = selectedFormat === "custom" ? customMaxChars : format.maxChars;

  const toggleLocale = (l: string) =>
    setSelectedLocales(prev => prev.includes(l) ? prev.filter(x => x !== l) : [...prev, l]);

  const getTexts = () => inputText.split("\n").map(l => l.trim()).filter(Boolean);

  const handleTranslate = async () => {
    const texts = getTexts();
    if (!texts.length || !selectedLocales.length) return;
    setLoading(true); setError(null); setResults([]);
    try {
      const ctx = `${format.label}${maxChars ? `, max ${maxChars} characters` : ""}`;
      const data = await runBatchTranslation(texts, selectedLocales, maxChars || undefined, ctx);
      setResults(data.results);
    } catch (e: any) {
      setError(e?.response?.data?.error || "Batch translation failed.");
    } finally {
      setLoading(false);
    }
  };

  const handleCopy = (text: string, key: string) => {
    navigator.clipboard.writeText(text);
    setCopiedCell(key);
    setTimeout(() => setCopiedCell(null), 1500);
  };

  const handleExportCSV = () => {
    if (!results.length) return;
    const headers = ["Source", ...selectedLocales.map(l => LOCALE_LABELS[l].replace(/\p{Emoji}/gu, "").trim())];
    const rows = results.map(r => [
      `"${r.source.replace(/"/g, '""')}"`,
      ...selectedLocales.map(l => `"${getCellText(r.translations[l]).replace(/"/g, '""')}"`),
    ]);
    const csv = [headers.join(","), ...rows.map(r => r.join(","))].join("\n");
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob(['\uFEFF' + csv], { type: "text/csv;charset=utf-8" }));
    a.download = `translations-${selectedFormat}.csv`;
    a.click();
  };

  const handleExportJSON = () => {
    if (!results.length) return;
    const exportData = results.map(r => ({
      source: r.source,
      translations: Object.fromEntries(
        selectedLocales.map(l => [l, {
          text: getCellText(r.translations[l]),
          qualityGate: getCellQG(r.translations[l]) ?? null,
        }])
      ),
    }));
    const a = document.createElement("a");
    a.href = URL.createObjectURL(new Blob([JSON.stringify(exportData, null, 2)], { type: "application/json" }));
    a.download = `translations-${selectedFormat}.json`;
    a.click();
  };

  const handleGetAlternatives = async (rowIdx: number, locale: string, source: string) => {
    const key = `${rowIdx}-${locale}`;
    setAlternatives(prev => ({ ...prev, [key]: { loading: true, options: [] } }));
    try {
      const ctx = `${format.label}${maxChars ? `, max ${maxChars} characters` : ""}`;
      const data = await getTranslationAlternatives(source, locale, maxChars || undefined, ctx);
      setAlternatives(prev => ({ ...prev, [key]: { loading: false, options: data.alternatives } }));
    } catch {
      setAlternatives(prev => ({ ...prev, [key]: { loading: false, options: [] } }));
    }
  };

  const handlePickAlternative = (rowIdx: number, locale: string, text: string) => {
    setResults(prev => prev.map((row, i) => {
      if (i !== rowIdx) return row;
      const existing = row.translations[locale];
      const updated = typeof existing === "object" && existing !== null
        ? { ...existing, text }
        : text;
      return { ...row, translations: { ...row.translations, [locale]: updated } };
    }));
    setAlternatives(prev => { const n = { ...prev }; delete n[`${rowIdx}-${locale}`]; return n; });
  };

  const handleStartEdit = (rowIdx: number, locale: string, current: string) => {
    const key = `${rowIdx}-${locale}`;
    setAlternatives(prev => { const n = { ...prev }; delete n[key]; return n; });
    setEditing(prev => ({ ...prev, [key]: current }));
  };

  const handleCommitEdit = (rowIdx: number, locale: string) => {
    const key = `${rowIdx}-${locale}`;
    const draft = editing[key];
    if (draft !== undefined)
      setResults(prev => prev.map((row, i) => {
        if (i !== rowIdx) return row;
        const existing = row.translations[locale];
        const updated = typeof existing === "object" && existing !== null
          ? { ...existing, text: draft }
          : draft;
        return { ...row, translations: { ...row.translations, [locale]: updated } };
      }));
    setEditing(prev => { const n = { ...prev }; delete n[key]; return n; });
  };

  const handleCancelEdit = (rowIdx: number, locale: string) => {
    setEditing(prev => { const n = { ...prev }; delete n[`${rowIdx}-${locale}`]; return n; });
  };

  const charClass = (len: number) => {
    if (!maxChars) return "";
    if (len > maxChars) return "over-limit";
    if (len > maxChars * 0.9) return "near-limit";
    return "";
  };

  const countClass = (len: number) => {
    if (!maxChars) return "";
    if (len > maxChars) return "over";
    if (len > maxChars * 0.9) return "near";
    return "";
  };

  const tdBg = (len: number): React.CSSProperties => {
    if (!maxChars) return {};
    if (len > maxChars) return { background: "var(--red-bg)" };
    if (len > maxChars * 0.9) return { background: "var(--amber-bg)" };
    return {};
  };

  const texts = getTexts();

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>

      {/* Format & Markets */}
      <div className="card">
        <div className="card-header"><span className="card-title">Format & Markets</span></div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1.25rem" }}>
          <div style={{ display: "grid", gridTemplateColumns: selectedFormat === "custom" ? "1fr auto" : "1fr", gap: "1rem" }}>
            <div className="field">
              <label className="field-label">Ad Format</label>
              <select className="select" value={selectedFormat} onChange={e => setSelectedFormat(e.target.value)}>
                {AD_FORMATS.map(f => (
                  <option key={f.id} value={f.id}>
                    {f.label}{f.maxChars ? ` — ${f.maxChars} chars` : ""}
                  </option>
                ))}
              </select>
              {format.hint && <span className="field-hint">{format.hint}</span>}
            </div>
            {selectedFormat === "custom" && (
              <div className="field">
                <label className="field-label">Max Chars</label>
                <input className="input" type="number" min={1} max={2000} style={{ width: "5rem" }}
                  value={customMaxChars} onChange={e => setCustomMaxChars(Number(e.target.value))} />
              </div>
            )}
          </div>

          <div className="field">
            <label className="field-label">Target Markets</label>
            <div className="toggle-group">
              {ALL_LOCALES.map(l => (
                <button key={l} className={`toggle-pill${selectedLocales.includes(l) ? " active" : ""}`}
                  onClick={() => toggleLocale(l)}>
                  {LOCALE_LABELS[l]}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* Source Input */}
      <div className="card">
        <div className="card-header">
          <span className="card-title">Source Texts</span>
          <span style={{ fontSize: "0.75rem", color: "var(--text-3)" }}>
            {texts.length} line{texts.length !== 1 ? "s" : ""}{maxChars ? ` · ${maxChars} char limit` : ""}
          </span>
        </div>
        <div className="card-body" style={{ display: "flex", flexDirection: "column", gap: "1rem" }}>
          <textarea className="textarea" style={{ height: "9rem" }}
            value={inputText} onChange={e => setInputText(e.target.value)}
            placeholder={"Support you can reach\nInvesting with support\nGlobal Markets, local support\n..."} />

          {/* Source char pills */}
          {texts.length > 0 && maxChars > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: "0.375rem" }}>
              {texts.map((t, i) => (
                <span key={i} className={`badge ${t.length > maxChars ? "badge-red" : "badge-gray"}`}>
                  {t.length}/{maxChars}
                </span>
              ))}
            </div>
          )}

          {error && <div className="alert alert-error">{error}</div>}

          <div>
            <button className="btn btn-primary"
              onClick={handleTranslate}
              disabled={loading || !texts.length || !selectedLocales.length}>
              {loading
                ? `Translating ${texts.length} text${texts.length > 1 ? "s" : ""} → ${selectedLocales.length} market${selectedLocales.length > 1 ? "s" : ""}…`
                : `Translate ${texts.length || "–"} text${texts.length !== 1 ? "s" : ""} → ${selectedLocales.length} market${selectedLocales.length !== 1 ? "s" : ""}`}
            </button>
          </div>
        </div>
      </div>

      {/* Results */}
      {results.length > 0 && (
        <div className="card" style={{ overflow: "hidden" }}>
          <div className="card-header">
            <span className="card-title">
              Results — {results.length} text{results.length !== 1 ? "s" : ""} × {selectedLocales.length} market{selectedLocales.length !== 1 ? "s" : ""}
            </span>
            <div style={{ display: "flex", gap: "0.375rem" }}>
              <button className="btn btn-secondary btn-sm" onClick={handleExportCSV}>CSV</button>
              <button className="btn btn-secondary btn-sm" onClick={handleExportJSON}>JSON</button>
            </div>
          </div>
          <div style={{ overflowX: "auto" }}>
            <table className="results-table">
              <thead>
                <tr>
                  <th style={{ minWidth: 180 }}>Source</th>
                  {selectedLocales.map(l => <th key={l} style={{ minWidth: 160 }}>{LOCALE_LABELS[l]}</th>)}
                </tr>
              </thead>
              <tbody>
                {results.map((row, rowIdx) => (
                  <tr key={rowIdx}>
                    {/* Source cell */}
                    <td style={tdBg(row.source.length)}>
                      <div className={`cell-text ${charClass(row.source.length)}`}>{row.source}</div>
                      {maxChars > 0 && (
                        <div className={`cell-count ${countClass(row.source.length)}`}>{row.source.length}/{maxChars}</div>
                      )}
                    </td>

                    {/* Translation cells */}
                    {selectedLocales.map(locale => {
                      const translated = getCellText(row.translations[locale]);
                      const qg = getCellQG(row.translations[locale]);
                      const outputId = getCellOutputId(row.translations[locale]);
                      const cellKey    = `${rowIdx}-${locale}`;
                      const alt        = alternatives[cellKey];
                      const isEditing  = cellKey in editing;
                      const draft      = editing[cellKey] ?? "";

                      return (
                        <td key={locale} style={{ ...tdBg((isEditing ? draft : translated).length), position: "relative" }}>
                          {isEditing ? (
                            <div>
                              <textarea className="cell-edit-area"
                                autoFocus value={draft}
                                onChange={e => setEditing(prev => ({ ...prev, [cellKey]: e.target.value }))}
                                onKeyDown={e => {
                                  if (e.key === "Enter" && !e.shiftKey) { e.preventDefault(); handleCommitEdit(rowIdx, locale); }
                                  if (e.key === "Escape") handleCancelEdit(rowIdx, locale);
                                }}
                              />
                              {maxChars > 0 && (
                                <div className={`cell-count ${countClass(draft.length)}`}>{draft.length}/{maxChars}</div>
                              )}
                              <div className="cell-actions" style={{ marginTop: "0.5rem" }}>
                                <button className="btn btn-primary btn-sm"
                                  onClick={() => handleCommitEdit(rowIdx, locale)}>Save</button>
                                <button className="btn btn-secondary btn-sm"
                                  onClick={() => handleCancelEdit(rowIdx, locale)}>Cancel</button>
                              </div>
                            </div>
                          ) : (
                            <div>
                              <div className={`cell-text ${charClass(translated.length)}`}
                                style={{ cursor: "pointer" }}
                                onClick={() => handleCopy(translated, cellKey)}
                                title="Click to copy">
                                {translated}
                              </div>
                              {maxChars > 0 && (
                                <div className={`cell-count ${countClass(translated.length)}`}>{translated.length}/{maxChars}</div>
                              )}
                              {qg && (
                                <span className={`badge ${qg.approved ? "badge-green" : "badge-amber"}`}
                                  style={{ marginTop: "0.25rem", fontSize: "0.625rem" }}>
                                  QG {Math.round(qg.score * 100)}%{qg.stage !== "initial" ? ` (${qg.stage})` : ""}
                                </span>
                              )}
                              {copiedCell === cellKey && <span className="copied-flash">Copied</span>}
                              {outputId !== undefined && translated.length > 0 && (
                                <ReviewPanel outputId={outputId} compact />
                              )}

                              {/* Alternatives panel */}
                              {alt && (
                                <div className="alt-panel">
                                  {alt.loading ? (
                                    <div style={{ display: "flex", flexDirection: "column", gap: "0.375rem" }}>
                                      {[1,2,3].map(i => <div key={i} className="skeleton" style={{ height: "2rem" }} />)}
                                    </div>
                                  ) : (
                                    <>
                                      {alt.options.map((opt, i) => (
                                        <button key={i}
                                          className={`alt-option ${maxChars && opt.length > maxChars ? "over-limit" : ""}`}
                                          onClick={() => handlePickAlternative(rowIdx, locale, opt)}>
                                          {opt}
                                          {maxChars > 0 && (
                                            <span className={`cell-count ${countClass(opt.length)}`}
                                              style={{ display: "block" }}>
                                              {opt.length}/{maxChars}
                                            </span>
                                          )}
                                        </button>
                                      ))}
                                      <button className="btn-ghost btn-sm"
                                        style={{ marginTop: "0.125rem" }}
                                        onClick={() => setAlternatives(prev => { const n = {...prev}; delete n[cellKey]; return n; })}>
                                        Close
                                      </button>
                                    </>
                                  )}
                                </div>
                              )}

                              {/* Action buttons */}
                              {!alt && (
                                <div className="cell-actions">
                                  <button className="btn btn-secondary btn-sm"
                                    onClick={() => handleGetAlternatives(rowIdx, locale, row.source)}>
                                    ↻ Options
                                  </button>
                                  <button className="btn btn-secondary btn-sm"
                                    onClick={() => handleStartEdit(rowIdx, locale, translated)}>
                                    ✎ Edit
                                  </button>
                                </div>
                              )}
                            </div>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
