"use client";

import { useState } from "react";
import {
  NanoBananaPreview,
  type NanoBananaBanner,
  type NanoBananaResponse,
} from "./NanoBananaPreview";

// Formats are clustered by what they can actually carry. "Creative"
// formats have enough canvas height to host a real headline +
// subheadline + readable CTA + standard-sized disclaimer.
// "Placement marker" formats (the three IAB micro-banners) are too
// tight for that — they ship with logo + headline + CTA + sub-readable
// disclaimer per brand convention, no subheadline.
const CREATIVE_FORMATS = [
  "1200x628",
  "1080x1080",
  "1080x1920",
  "1200x1200",
  "300x250",
  "336x280",
  "960x1200",
  "160x600",
  "250x250",
  "300x1050",
  "300x600",
  "970x250",
] as const;

const PLACEMENT_FORMATS = [
  "728x90",
  "320x100",
  "320x50",
] as const;

const SUPPORTED_FORMATS = [
  ...CREATIVE_FORMATS,
  ...PLACEMENT_FORMATS,
] as const;

const LOCALES = [
  "en-GB",
  "fr-FR",
  "it-IT",
  "nl-NL",
  "nl-BE",
  "fr-BE",
  "es-ES",
] as const;

const GOALS = [
  "awareness",
  "consideration",
  "conversion",
  "retention",
] as const;

// Preset strategic ideas tuned to MEXEM's actual positioning. The dropdown
// fills the textarea; the user can still edit freely or write something
// custom from scratch by selecting "Custom".
const STRATEGIC_IDEA_PRESETS: { label: string; value: string }[] = [
  {
    label: "Calm, professional gateway",
    value:
      "Position MEXEM as the calm, professional gateway to global investing.",
  },
  {
    label: "Access 170+ global markets",
    value:
      "Highlight that one MEXEM account opens access to 170+ global markets without juggling brokers.",
  },
  {
    label: "Low-cost €1 trade",
    value:
      "Emphasize the €1 trading fee as a no-noise, predictable cost for serious investors.",
  },
  {
    label: "Commission-free ETFs",
    value:
      "Position MEXEM as the place to build long-term wealth with commission-free ETF investing.",
  },
  {
    label: "Professional platform, every device",
    value:
      "Show MEXEM as a professional-grade trading platform that follows you across desktop, tablet, and phone.",
  },
  {
    label: "One account, all markets",
    value:
      "Frame MEXEM as a single account that consolidates equities, ETFs, options, futures, and FX across global markets.",
  },
  {
    label: "Powered by Interactive Brokers",
    value:
      "Position MEXEM as the European-facing front-end of Interactive Brokers' institutional execution.",
  },
  {
    label: "Self-directed long-term investor",
    value:
      "Speak to the self-directed long-term investor who wants institutional tools without retail-app gimmicks.",
  },
];

const CUSTOM_IDEA_OPTION = "__custom__";

export function NanoBananaForm() {
  const [campaignMessage, setCampaignMessage] = useState(
    "Trade global markets from one professional account.",
  );
  const [strategicIdeaPreset, setStrategicIdeaPreset] = useState<string>(
    STRATEGIC_IDEA_PRESETS[0].value,
  );
  const [strategicIdea, setStrategicIdea] = useState(
    STRATEGIC_IDEA_PRESETS[0].value,
  );
  const [tone, setTone] = useState("calm and professional");
  const [formats, setFormats] = useState<string[]>(["1200x628"]);
  const [targetLocale, setTargetLocale] = useState<(typeof LOCALES)[number]>(
    "en-GB",
  );
  const [campaignGoal, setCampaignGoal] = useState<(typeof GOALS)[number]>(
    "awareness",
  );
  const [visualHint, setVisualHint] = useState("");
  // Default OFF: each format gets its own Gemini call at its native
  // aspect ratio — same brand prompt, format-correct composition per
  // size. This is what "same design exactly" actually means in
  // practice: the creative concept is shared (calm navy gradient,
  // brand palette, trading mockup) but the layout for each canvas
  // size is composed natively rather than cropped from a 1:1 source.
  // ON: cheaper (single Gemini call), but the shared image gets
  // smart-cropped per format which can lose key visual elements on
  // extreme aspect ratios like 1200×1200 (square) cropped from 1:1.
  const [sameImage, setSameImage] = useState(false);
  // Background source. "brand" (default) uses the per-format PNG already
  // saved in /brand-input-preview/backgrounds/background_<format>.png —
  // no Gemini call, no API cost, pixel-exact to the brand reference.
  // "generate" calls Nano Banana to invent a new creative background.
  // Default to "generate" — the whole point of this section is creative
  // AI generation with brand rules. The "brand" fallback is opt-in for
  // free-tier / no-quota runs.
  const [backgroundSource, setBackgroundSource] = useState<"brand" | "generate">(
    "generate",
  );

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<NanoBananaResponse | null>(null);

  function onPresetChange(value: string) {
    setStrategicIdeaPreset(value);
    if (value !== CUSTOM_IDEA_OPTION) {
      setStrategicIdea(value);
    }
  }

  function toggleFormat(f: string, checked: boolean) {
    setFormats((prev) => {
      if (checked) return prev.includes(f) ? prev : [...prev, f];
      const next = prev.filter((x) => x !== f);
      return next.length ? next : prev; // never let the user uncheck all
    });
  }

  async function onSubmit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch("/api/generate-nano-banner", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          formats,
          targetLocale,
          campaignMessage,
          campaignGoal,
          strategicIdea,
          tone,
          visualHint: visualHint.trim() || undefined,
          sameImage,
          backgroundSource,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setError(
          `${data.error ?? "request_failed"}${
            data.details ? `: ${data.details}` : ""
          }`,
        );
        return;
      }
      setResult(data);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="space-y-8">
      <form
        onSubmit={onSubmit}
        className="grid grid-cols-1 gap-4 rounded border border-zinc-200 p-6 dark:border-zinc-800 sm:grid-cols-2"
      >
        <label className="col-span-2 space-y-1 text-sm">
          <span className="font-medium">Campaign message</span>
          <textarea
            value={campaignMessage}
            onChange={(e) => setCampaignMessage(e.target.value)}
            required
            minLength={8}
            rows={2}
            className="w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="col-span-2 space-y-1 text-sm">
          <span className="font-medium">Strategic idea</span>
          <select
            value={strategicIdeaPreset}
            onChange={(e) => onPresetChange(e.target.value)}
            className="w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {STRATEGIC_IDEA_PRESETS.map((p) => (
              <option key={p.value} value={p.value}>
                {p.label}
              </option>
            ))}
            <option value={CUSTOM_IDEA_OPTION}>Custom…</option>
          </select>
          <textarea
            value={strategicIdea}
            onChange={(e) => setStrategicIdea(e.target.value)}
            required
            minLength={8}
            rows={2}
            readOnly={strategicIdeaPreset !== CUSTOM_IDEA_OPTION}
            className="w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900 read-only:bg-zinc-50 read-only:text-zinc-700 dark:read-only:bg-zinc-900 dark:read-only:text-zinc-300"
          />
        </label>

        <fieldset className="col-span-2 space-y-2 text-sm">
          <legend className="font-medium">Background source</legend>
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label
              className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-xs ${
                backgroundSource === "brand"
                  ? "border-amber-400 bg-amber-50 dark:bg-amber-950"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="bg-source"
                checked={backgroundSource === "brand"}
                onChange={() => setBackgroundSource("brand")}
                className="mt-0.5"
              />
              <span>
                <strong>Brand background</strong> (per format)
                <br />
                <span className="text-zinc-500">
                  Pre-built PNGs from <code>brand-input/background/</code>.
                  Pixel-exact to the brand reference, no Gemini call.
                </span>
              </span>
            </label>
            <label
              className={`flex cursor-pointer items-start gap-2 rounded border px-3 py-2 text-xs ${
                backgroundSource === "generate"
                  ? "border-amber-400 bg-amber-50 dark:bg-amber-950"
                  : "border-zinc-300 dark:border-zinc-700"
              }`}
            >
              <input
                type="radio"
                name="bg-source"
                checked={backgroundSource === "generate"}
                onChange={() => setBackgroundSource("generate")}
                className="mt-0.5"
              />
              <span>
                <strong>Generate with Nano Banana</strong>
                <br />
                <span className="text-zinc-500">
                  Creative AI background per the brand prompt. Costs ~$0.04
                  per Gemini call.
                </span>
              </span>
            </label>
          </div>
        </fieldset>

        <fieldset className="col-span-2 space-y-3 text-sm">
          <legend className="font-medium">Formats</legend>
          <div className="space-y-1">
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Creative banners
              <span className="ml-1 font-normal text-zinc-500">
                — full layout (logo + headline + subheadline + CTA + disclaimer)
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {CREATIVE_FORMATS.map((f) => {
                const checked = formats.includes(f);
                return (
                  <label
                    key={f}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-xs ${
                      checked
                        ? "border-amber-400 bg-amber-50 dark:bg-amber-950"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleFormat(f, e.target.checked)}
                    />
                    {f}
                  </label>
                );
              })}
            </div>
          </div>
          <div className="space-y-1">
            <div className="text-xs font-medium text-zinc-700 dark:text-zinc-300">
              Placement markers
              <span className="ml-1 font-normal text-zinc-500">
                — micro IAB sizes. No subheadline; disclaimer rendered as fine
                print per brand convention.
              </span>
            </div>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-4">
              {PLACEMENT_FORMATS.map((f) => {
                const checked = formats.includes(f);
                return (
                  <label
                    key={f}
                    className={`flex cursor-pointer items-center gap-2 rounded border px-2 py-1.5 text-xs ${
                      checked
                        ? "border-amber-400 bg-amber-50 dark:bg-amber-950"
                        : "border-zinc-300 dark:border-zinc-700"
                    }`}
                  >
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={(e) => toggleFormat(f, e.target.checked)}
                    />
                    {f}
                  </label>
                );
              })}
            </div>
          </div>
          <label className="mt-2 flex items-start gap-2 rounded border border-zinc-200 bg-zinc-50 p-2 text-xs dark:border-zinc-700 dark:bg-zinc-900">
            <input
              type="checkbox"
              checked={sameImage}
              onChange={(e) => setSameImage(e.target.checked)}
              className="mt-0.5"
            />
            <span>
              <strong>Reuse one shared image (cheap mode)</strong>{" "}
              <span className="text-zinc-500">
                — single Gemini call at 1:1; the same image gets
                smart-cropped to every checked format. Can lose visual
                content on extreme aspect ratios (e.g. 1200×1200 cropped
                from a 1:1 source). UNCHECKED (default) generates a
                fresh, format-native background per size with the same
                brand prompt — one Gemini call per format, but every
                canvas is properly composed.
              </span>
            </span>
          </label>
        </fieldset>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Locale</span>
          <select
            value={targetLocale}
            onChange={(e) =>
              setTargetLocale(e.target.value as (typeof LOCALES)[number])
            }
            className="w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {LOCALES.map((l) => (
              <option key={l} value={l}>
                {l}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Goal</span>
          <select
            value={campaignGoal}
            onChange={(e) =>
              setCampaignGoal(e.target.value as (typeof GOALS)[number])
            }
            className="w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          >
            {GOALS.map((g) => (
              <option key={g} value={g}>
                {g}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1 text-sm">
          <span className="font-medium">Tone</span>
          <input
            value={tone}
            onChange={(e) => setTone(e.target.value)}
            className="w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <label className="col-span-2 space-y-1 text-sm">
          <span className="font-medium">
            Visual hint{" "}
            <span className="text-zinc-500">(optional creative direction)</span>
          </span>
          <input
            value={visualHint}
            onChange={(e) => setVisualHint(e.target.value)}
            placeholder="e.g. abstract candlestick flow on the right, soft 3D depth"
            className="w-full rounded border border-zinc-300 bg-white p-2 text-sm dark:border-zinc-700 dark:bg-zinc-900"
          />
        </label>

        <div className="col-span-2 flex items-center justify-between">
          <p className="text-xs text-zinc-500">
            Calls Nano Banana for the visual, marketing-translator for the copy.
            One banner per submission. Output saved under /public/nano-banana/.
          </p>
          <button
            type="submit"
            disabled={loading}
            className="rounded bg-amber-400 px-4 py-2 text-sm font-semibold text-zinc-900 hover:bg-amber-300 disabled:opacity-50"
          >
            {loading ? "Generating…" : "Generate"}
          </button>
        </div>
      </form>

      {error && (
        <pre className="overflow-auto rounded border border-red-300 bg-red-50 p-3 text-xs text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
          {error}
        </pre>
      )}

      {result && <NanoBananaPreview response={result} />}
    </div>
  );
}
