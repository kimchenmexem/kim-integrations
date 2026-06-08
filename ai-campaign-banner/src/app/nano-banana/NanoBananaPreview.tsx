"use client";

import { useState } from "react";
import type { FormatZones } from "@/lib/formats/mexemZones";

export interface NanoBananaQaCheck {
  id: string;
  pass: boolean;
  detail: string;
}

export interface NanoBananaQaResult {
  pass: boolean;
  attempts: number;
  checks: NanoBananaQaCheck[];
}

export interface NanoBananaBanner {
  status: "ok" | "error";
  format: string;
  // success-only:
  imagePath?: string;
  prompt?: string;
  zones?: FormatZones;
  qa?: NanoBananaQaResult;
  // error-only:
  error?: string;
}

export interface NanoBananaResponse {
  batchId: string;
  locale: string;
  direction: "ltr" | "rtl";
  copy: {
    headline: string;
    subheadline: string;
    cta: string;
    disclaimer: string;
  };
  cta_style: {
    background_color: string;
    color: string;
    font_family: string;
    font_weight: number;
    border_radius_ratio: number;
    font_size_ratio: number;
  };
  text_style: {
    headlineColor: string;
    subheadlineColor: string;
    disclaimerColor: string;
    disclaimerOpacity: number;
    backgroundFallback: string;
    fontStack: string;
    charWidthRatio: number;
  };
  all_zones: Record<string, FormatZones>;
  supported_formats: string[];
  banners: NanoBananaBanner[];
}

const TEXT_SLOTS = {
  headline: { startRatio: 0.0, endRatio: 0.6 },
  subheadline: { startRatio: 0.6, endRatio: 0.85 },
} as const;

function subSlot(
  textZone: { x: number; y: number; width: number; height: number },
  slot: keyof typeof TEXT_SLOTS,
) {
  const { startRatio, endRatio } = TEXT_SLOTS[slot];
  const y = textZone.y + Math.round(textZone.height * startRatio);
  const h =
    Math.round(textZone.height * endRatio) -
    Math.round(textZone.height * startRatio);
  return { x: textZone.x, y, width: textZone.width, height: h };
}

// Heuristic text-fit: pick the largest font_size that satisfies
//   1. text on `lines` lines fits within `slotW` (per-char width ≈ font*charWidth)
//   2. `lines` lines tall fit within `slotH` (line-height ≈ 1.1)
//   3. font doesn't exceed `slotH * heightRatio` (visual cap)
// `lines` is "preferred max"; if the slot is too short to accommodate
// that many readable lines (≥ minPerLine), the count is reduced
// adaptively. This is what keeps the disclaimer readable on a 728×90's
// 12 px-tall risk strip while still wrapping to 2 lines on bigger sizes.
function fitFontSize(
  text: string,
  slotW: number,
  slotH: number,
  opts: {
    heightRatio?: number;
    charWidth?: number;
    lines?: number;
    lineHeight?: number;
    min?: number;
  } = {},
): { fontSize: number; lines: number } {
  const chars = Math.max(1, text.length);
  const preferLines = opts.lines ?? 1;
  const lineHeight = opts.lineHeight ?? 1.1;
  const charWidth = opts.charWidth ?? 0.55;
  const heightRatio = opts.heightRatio ?? 0.65;
  const min = opts.min ?? 10;
  // Don't ask for more lines than the slot can physically host at `min`.
  const maxLinesAtMin = Math.max(1, Math.floor(slotH / (min * lineHeight)));
  const lines = Math.min(preferLines, maxLinesAtMin);
  const byWidth = (slotW * lines) / (chars * charWidth);
  const byHeight = slotH / (lines * lineHeight);
  const byHeightRatio = slotH * heightRatio;
  const fontSize = Math.max(
    min,
    Math.floor(Math.min(byWidth, byHeight, byHeightRatio)),
  );
  return { fontSize, lines };
}

export function NanoBananaPreview({ response }: { response: NanoBananaResponse }) {
  const ok = response.banners.filter((b) => b.status === "ok");
  const failed = response.banners.filter((b) => b.status === "error");
  const [propagateFrom, setPropagateFrom] = useState<NanoBananaBanner | null>(null);

  // When "apply to all sizes" is active, build a banner-per-format list
  // that all point at the same background image but use each format's
  // own zones for the overlays.
  const propagated: NanoBananaBanner[] | null =
    propagateFrom && propagateFrom.status === "ok" && propagateFrom.imagePath
      ? response.supported_formats.map((fmt) => ({
          status: "ok",
          format: fmt,
          imagePath: propagateFrom.imagePath,
          prompt: propagateFrom.prompt,
          zones: response.all_zones[fmt],
        }))
      : null;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-baseline gap-3">
        <h2 className="text-lg font-semibold">Banners</h2>
        <span className="rounded bg-zinc-200 px-2 py-0.5 text-xs dark:bg-zinc-800">
          {response.locale}
        </span>
        <span className="rounded bg-emerald-200 px-2 py-0.5 text-xs text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100">
          {ok.length} ok
        </span>
        {failed.length > 0 && (
          <span className="rounded bg-red-200 px-2 py-0.5 text-xs text-red-900 dark:bg-red-900 dark:text-red-100">
            {failed.length} failed
          </span>
        )}
        {propagateFrom && (
          <button
            type="button"
            onClick={() => setPropagateFrom(null)}
            className="ml-auto rounded border border-zinc-400 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
          >
            ← Back to original
          </button>
        )}
      </div>

      <div className="rounded border border-zinc-200 p-4 text-xs dark:border-zinc-800">
        <div className="font-medium text-zinc-700 dark:text-zinc-300">
          Copy (marketing-translator) — shared across all formats. Disclaimer
          forced to brand-canonical string for the locale.
        </div>
        <pre className="mt-2 whitespace-pre-wrap break-words">
          {JSON.stringify(response.copy, null, 2)}
        </pre>
      </div>

      <div className="space-y-6">
        {(propagated ?? response.banners).map((b, i) => (
          <BannerCard
            key={`${b.format}-${i}-${b.imagePath ?? ""}`}
            banner={b}
            copy={response.copy}
            ctaStyle={response.cta_style}
            textStyle={response.text_style}
            direction={response.direction}
            propagated={!!propagated}
            onPropagateAll={() => setPropagateFrom(b)}
          />
        ))}
      </div>
    </div>
  );
}

function BannerCard({
  banner,
  copy,
  ctaStyle,
  textStyle,
  direction,
  propagated,
  onPropagateAll,
}: {
  banner: NanoBananaBanner;
  copy: NanoBananaResponse["copy"];
  ctaStyle: NanoBananaResponse["cta_style"];
  textStyle: NanoBananaResponse["text_style"];
  direction: "ltr" | "rtl";
  propagated: boolean;
  onPropagateAll: () => void;
}) {
  if (banner.status === "error") {
    return (
      <div className="rounded border border-red-300 bg-red-50 p-4 text-sm text-red-900 dark:border-red-800 dark:bg-red-950 dark:text-red-200">
        <div className="font-medium">{banner.format} — failed</div>
        <pre className="mt-2 whitespace-pre-wrap break-words text-xs">
          {banner.error}
        </pre>
      </div>
    );
  }
  if (!banner.zones || !banner.imagePath) return null;

  const [w, h] = banner.format.split("x").map(Number);
  const headline = subSlot(banner.zones.text, "headline");
  const subheadline = subSlot(banner.zones.text, "subheadline");
  // Canonical contract: each format declares whether it renders a
  // subheadline via `MEXEM_ZONES[fmt].noSubheadline`. True only on
  // Placement markers (728×90, 320×100, 320×50). The flag is part of
  // the per-banner `zones` payload returned by the API.
  const renderSubheadline = banner.zones.noSubheadline !== true;
  const ctaRadius = Math.round(banner.zones.cta.height * ctaStyle.border_radius_ratio);

  // Width-aware font fitting — picks the largest size that fits both the
  // slot height AND the actual character count. Without this, long
  // translator strings like "Trade international assets from one account
  // with MEXEM" overflow horizontally and get clipped by overflow:hidden.
  // Char-width ratio comes from LANG_META so font fitting matches whatever
  // script we're rendering (Hebrew/Arabic letters track narrower; French
  // slightly wider than English — already calibrated in language.ts).
  const cw = textStyle.charWidthRatio;
  const ctaFit = fitFontSize(copy.cta, banner.zones.cta.width - 24, banner.zones.cta.height, {
    heightRatio: ctaStyle.font_size_ratio,
    charWidth: cw + 0.05,
    lines: 1,
    min: 9,
  });
  const headlineFit = fitFontSize(copy.headline, headline.width, headline.height, {
    heightRatio: 0.65,
    charWidth: cw,
    lines: 2,
    lineHeight: 1.05,
    min: 12,
  });
  const subFit = fitFontSize(copy.subheadline, subheadline.width, subheadline.height, {
    heightRatio: 0.55,
    charWidth: cw - 0.05,
    lines: 2,
    lineHeight: 1.2,
    min: 9,
  });
  // Disclaimer font size is capped tightly so it always reads as "fine
  // print" and never crowds its strip. The width-aware fitter still has
  // the final say if a long string would overflow, but the height cap
  // (0.22) keeps it visually subordinate to the headline on every
  // format. Two-line wrap allowed; single-line forced on tiny strips
  // (728×90) because two lines don't fit at the legible minimum.
  const disclaimerFit = fitFontSize(
    copy.disclaimer,
    banner.zones.risk_msg.width - 40,
    banner.zones.risk_msg.height,
    {
      heightRatio: 0.22,
      charWidth: cw,
      lines: 2,
      lineHeight: 1.2,
      min: 8,
    },
  );
  const ctaFontSize = ctaFit.fontSize;
  const headlineFontSize = headlineFit.fontSize;
  const subFontSize = subFit.fontSize;
  const disclaimerFontSize = disclaimerFit.fontSize;

  const logoUrl = logoPathFor(banner.zones.logo);

  async function onDownloadSvg() {
    if (!banner.imagePath || !banner.zones) return;
    const svg = await buildSvg({
      format: banner.format,
      imagePath: banner.imagePath,
      zones: banner.zones,
      copy,
      ctaStyle,
      textStyle,
      direction,
      fontSizes: {
        headline: headlineFontSize,
        subheadline: subFontSize,
        cta: ctaFontSize,
        disclaimer: disclaimerFontSize,
      },
    });
    triggerDownload(`${banner.format}-${Date.now()}.svg`, svg, "image/svg+xml");
  }

  async function onDownloadFlatPng() {
    if (!banner.imagePath || !banner.zones) return;
    const svg = await buildSvg({
      format: banner.format,
      imagePath: banner.imagePath,
      zones: banner.zones,
      copy,
      ctaStyle,
      textStyle,
      direction,
      fontSizes: {
        headline: headlineFontSize,
        subheadline: subFontSize,
        cta: ctaFontSize,
        disclaimer: disclaimerFontSize,
      },
    });
    const res = await fetch("/api/rasterize-svg", {
      method: "POST",
      headers: { "content-type": "image/svg+xml" },
      body: svg,
    });
    if (!res.ok) {
      const err = await res.text().catch(() => "");
      alert(`Flat PNG export failed: ${res.status} ${err.slice(0, 200)}`);
      return;
    }
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${banner.format}-${Date.now()}.png`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-baseline gap-3">
        <h3 className="text-sm font-semibold">{banner.format}</h3>
        {banner.qa && (
          <span
            title={banner.qa.checks
              .map((c) => `${c.pass ? "✓" : "✗"} ${c.id}: ${c.detail}`)
              .join("\n")}
            className={`rounded px-2 py-0.5 text-xs font-medium ${
              banner.qa.pass
                ? "bg-emerald-200 text-emerald-900 dark:bg-emerald-900 dark:text-emerald-100"
                : "bg-red-200 text-red-900 dark:bg-red-900 dark:text-red-100"
            }`}
          >
            QA {banner.qa.pass ? "✓" : "✗"} (try {banner.qa.attempts})
          </span>
        )}
        <a
          href={banner.imagePath}
          className="text-xs text-zinc-600 underline hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
        >
          download raw background
        </a>
        <button
          type="button"
          onClick={onDownloadSvg}
          className="rounded border border-zinc-400 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
        >
          Download SVG (Figma-ready)
        </button>
        <button
          type="button"
          onClick={onDownloadFlatPng}
          className="rounded border border-zinc-400 px-2 py-0.5 text-xs hover:bg-zinc-100 dark:hover:bg-zinc-800"
          title="Composited PNG at canvas size — bypasses Figma SVG quirks"
        >
          Download flat PNG
        </button>
        {!propagated && (
          <button
            type="button"
            onClick={onPropagateAll}
            className="rounded border border-amber-500 bg-amber-100 px-2 py-0.5 text-xs font-medium text-amber-900 hover:bg-amber-200 dark:bg-amber-950 dark:text-amber-100"
          >
            Apply this design to all sizes
          </button>
        )}
      </div>
      {banner.qa && !banner.qa.pass && (
        <details className="rounded border border-red-300 bg-red-50 p-2 text-xs dark:border-red-800 dark:bg-red-950">
          <summary className="cursor-pointer font-medium text-red-900 dark:text-red-200">
            QA failed after {banner.qa.attempts} attempt(s) — image kept anyway. Click to see which checks failed.
          </summary>
          <ul className="mt-2 space-y-1">
            {banner.qa.checks.map((c) => (
              <li key={c.id}>
                {c.pass ? "✓" : "✗"} <code>{c.id}</code> — {c.detail}
              </li>
            ))}
          </ul>
        </details>
      )}
      <div className="overflow-auto rounded border border-zinc-300 dark:border-zinc-700">
        <div
          dir={direction}
          style={{
            position: "relative",
            width: w,
            height: h,
            backgroundColor: textStyle.backgroundFallback,
            color: textStyle.headlineColor,
            fontFamily: textStyle.fontStack,
          }}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={banner.imagePath}
            alt=""
            style={{
              position: "absolute",
              inset: 0,
              width: "100%",
              height: "100%",
              objectFit: "cover",
            }}
          />
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={logoUrl}
            alt="MEXEM"
            style={{
              position: "absolute",
              left: banner.zones.logo.x,
              top: banner.zones.logo.y,
              width: banner.zones.logo.width,
              height: banner.zones.logo.height,
              objectFit: "contain",
              objectPosition: "left top",
            }}
          />
          <div
            style={{
              position: "absolute",
              left: headline.x,
              top: headline.y,
              width: headline.width,
              height: headline.height,
              color: textStyle.headlineColor,
              fontFamily: textStyle.fontStack,
              fontSize: headlineFontSize,
              fontWeight: 700,
              lineHeight: 1.05,
              letterSpacing: -1,
              textTransform: "uppercase",
              overflowWrap: "break-word",
              overflow: "hidden",
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "flex-start",
              textAlign: "left",
              boxSizing: "border-box",
            }}
          >
            {copy.headline}
          </div>
          {renderSubheadline && (
            <div
              style={{
                position: "absolute",
                left: subheadline.x,
                top: subheadline.y,
                width: subheadline.width,
                height: subheadline.height,
                color: textStyle.subheadlineColor,
                fontFamily: textStyle.fontStack,
                fontSize: subFontSize,
                fontWeight: 500,
                lineHeight: 1.2,
                overflowWrap: "break-word",
                overflow: "hidden",
                opacity: 0.95,
                display: "flex",
                alignItems: "flex-start",
                justifyContent: "flex-start",
                textAlign: "left",
                boxSizing: "border-box",
              }}
            >
              {copy.subheadline}
            </div>
          )}
          <div
            style={{
              position: "absolute",
              left: banner.zones.cta.x,
              top: banner.zones.cta.y,
              width: banner.zones.cta.width,
              height: banner.zones.cta.height,
              backgroundColor: ctaStyle.background_color,
              color: ctaStyle.color,
              fontSize: ctaFontSize,
              fontWeight: ctaStyle.font_weight,
              fontFamily: ctaStyle.font_family,
              borderRadius: ctaRadius,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textTransform: "uppercase",
              letterSpacing: 0.5,
              padding: "0 12px",
              whiteSpace: "nowrap",
              overflow: "hidden",
              textOverflow: "ellipsis",
            }}
          >
            {copy.cta}
          </div>
          <div
            style={{
              position: "absolute",
              left: banner.zones.risk_msg.x,
              top: banner.zones.risk_msg.y,
              width: banner.zones.risk_msg.width,
              height: banner.zones.risk_msg.height,
              color: textStyle.disclaimerColor,
              fontFamily: textStyle.fontStack,
              fontWeight: 400,
              opacity: textStyle.disclaimerOpacity,
              fontSize: disclaimerFontSize,
              lineHeight: 1.2,
              padding: "0 20px",
              overflowWrap: "break-word",
              wordBreak: "break-word",
              overflow: "hidden",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              textAlign: "center",
              boxSizing: "border-box",
              letterSpacing: 0.1,
            }}
          >
            {copy.disclaimer}
          </div>
        </div>
      </div>
      <details className="text-xs">
        <summary className="cursor-pointer text-zinc-500 hover:text-zinc-700 dark:hover:text-zinc-300">
          Show generation prompt
        </summary>
        <pre className="mt-2 whitespace-pre-wrap break-words rounded border border-zinc-200 p-3 dark:border-zinc-800">
          {banner.prompt}
        </pre>
      </details>
    </div>
  );
}

// ── SVG / Figma export ──────────────────────────────────────────────────────
//
// Builds a self-contained SVG with the background and logo embedded as
// base64, plus named <g> layers for each element. Figma imports SVG and
// preserves the layer hierarchy when each <g> has a unique `id`.

// Two logo variants ship in /public/brand-input-preview/brand_logo/:
//   - logo-white-v.png  888×192  (4.62:1) — wordmark only, for wide
//     leaderboard zones where the brand reference uses just the
//     wordmark (e.g. 1200×628, 970×250, 728×90, 300×250, 336×280).
//   - logo-white-p.png  871×635  (1.37:1) — wordmark + "Powered by
//     InteractiveBrokers" sub-lockup, for portrait zones where the
//     brand shows the full stacked lockup (e.g. 1080×1920).
// Pick by zone aspect — wide zones get V, square-ish zones get P.
const LOGO_WIDE_PATH = "/brand-input-preview/brand_logo/logo-white-v.png";
const LOGO_STACKED_PATH = "/brand-input-preview/brand_logo/logo-white-p.png";
const WIDE_LOGO_ZONE_ASPECT_THRESHOLD = 2.5;
function logoPathFor(logoZone: { width: number; height: number }): string {
  const zoneAspect = logoZone.width / logoZone.height;
  return zoneAspect >= WIDE_LOGO_ZONE_ASPECT_THRESHOLD
    ? LOGO_WIDE_PATH
    : LOGO_STACKED_PATH;
}

interface BuildSvgArgs {
  format: string;
  imagePath: string;
  zones: FormatZones;
  copy: NanoBananaResponse["copy"];
  ctaStyle: NanoBananaResponse["cta_style"];
  textStyle: NanoBananaResponse["text_style"];
  direction: "ltr" | "rtl";
  fontSizes: {
    headline: number;
    subheadline: number;
    cta: number;
    disclaimer: number;
  };
}

// Escape for SVG attribute/text content. Most important fix vs. the
// previous version: also escape the double-quote, because LANG_META's
// fontStack contains literal "Poppins" / "Inter" quotes that otherwise
// terminate the SVG attribute early and produce malformed XML.
function escapeSvg(s: string): string {
  return s
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

// Wrap text into N lines that fit within `maxWidth` at `fontSize`, using
// a per-char-width estimate (Poppins regular ≈ 0.55, bold ≈ 0.60 of em).
// Splits on word boundaries; if a single word is wider than maxWidth it
// just keeps it on its own line (better than splitting mid-word — the
// fitter should have picked a smaller font in that case).
function wrapText(text: string, maxWidth: number, fontSize: number, charWidth: number): string[] {
  const maxChars = Math.max(1, Math.floor(maxWidth / (fontSize * charWidth)));
  const words = text.split(/\s+/).filter(Boolean);
  const lines: string[] = [];
  let current = "";
  for (const word of words) {
    const tentative = current ? `${current} ${word}` : word;
    if (tentative.length <= maxChars) {
      current = tentative;
    } else {
      if (current) lines.push(current);
      current = word;
    }
  }
  if (current) lines.push(current);
  return lines.length ? lines : [text];
}

async function buildSvg(args: BuildSvgArgs): Promise<string> {
  const { format, imagePath, zones, copy, ctaStyle, textStyle, fontSizes } = args;
  const [w, h] = format.split("x").map(Number);
  const [bgData, logoData] = await Promise.all([
    fetchAsDataUri(imagePath),
    fetchAsDataUri(logoPathFor(zones.logo)),
  ]);
  // Logo source is 871×635 (square-ish — includes the 'Powered by IB'
  // sub-lockup). Zone widths are tuned for the wordmark alone, so the
  // zone aspect is usually 4–5× wider than the source. Compute the
  // fitted bbox here so Figma can't stretch the logo: width/height
  // attributes in the SVG ALREADY match the source aspect.
  const logoNatural = await getImageDimensions(logoData);
  const logoBox = fitAspect(logoNatural, zones.logo);
  const headline = subSlot(zones.text, "headline");
  const subheadline = subSlot(zones.text, "subheadline");
  const ctaRadius = Math.round(zones.cta.height * ctaStyle.border_radius_ratio);
  const cw = textStyle.charWidthRatio;

  // Pre-wrap text into multiple lines so SVG <text> renders inside the
  // slot. Headline + subheadline use the slot width; disclaimer uses
  // the risk_msg strip width with side padding.
  const headlineLines = wrapText(copy.headline, headline.width, fontSizes.headline, cw);
  const subLines = wrapText(copy.subheadline, subheadline.width, fontSizes.subheadline, cw - 0.05);
  const discWidth = Math.max(1, zones.risk_msg.width - 40);
  const discLines = wrapText(copy.disclaimer, discWidth, fontSizes.disclaimer, cw - 0.05);

  // Compose <tspan> lines for headline (top-aligned to its slot — first
  // line baseline ≈ slot.y + fontSize, subsequent lines step down by
  // lineHeight).
  const lineHeightHeadline = 1.05;
  const lineHeightSub = 1.2;
  const lineHeightDisc = 1.15;

  const headlineTspans = headlineLines
    .map((line, i) => {
      const dy = i === 0 ? 0 : fontSizes.headline * lineHeightHeadline;
      return `<tspan x="${headline.x}" dy="${dy}">${escapeSvg(line)}</tspan>`;
    })
    .join("");
  const subTspans = subLines
    .map((line, i) => {
      const dy = i === 0 ? 0 : fontSizes.subheadline * lineHeightSub;
      return `<tspan x="${subheadline.x}" dy="${dy}">${escapeSvg(line)}</tspan>`;
    })
    .join("");
  const discTspans = discLines
    .map((line, i) => {
      const dy = i === 0 ? 0 : fontSizes.disclaimer * lineHeightDisc;
      return `<tspan x="${zones.risk_msg.x + zones.risk_msg.width / 2}" dy="${dy}">${escapeSvg(line)}</tspan>`;
    })
    .join("");

  // Disclaimer block needs to be vertically centered in its strip.
  // Total block height = disclaimer lines × lineHeight × fontSize.
  const discBlockHeight = discLines.length * fontSizes.disclaimer * lineHeightDisc;
  const discFirstBaselineY =
    zones.risk_msg.y +
    (zones.risk_msg.height - discBlockHeight) / 2 +
    fontSizes.disclaimer; // baseline of FIRST line

  return `<?xml version="1.0" encoding="UTF-8"?>
<svg xmlns="http://www.w3.org/2000/svg" width="${w}" height="${h}" viewBox="0 0 ${w} ${h}">
  <title>${escapeSvg(format)} — Nano Banana × MEXEM</title>
  <desc>Background generated by Gemini 2.5 Flash Image. Text from marketing-translator. Layout from MEXEM brand zones.</desc>

  <g id="background">
    <rect x="0" y="0" width="${w}" height="${h}" fill="${textStyle.backgroundFallback}"/>
    <image href="${bgData}" x="0" y="0" width="${w}" height="${h}"/>
  </g>

  <g id="logo">
    <image href="${logoData}" x="${logoBox.x}" y="${logoBox.y}" width="${logoBox.width}" height="${logoBox.height}"/>
  </g>

  <g id="headline" font-family="${escapeSvg(textStyle.fontStack)}" font-weight="700" fill="${textStyle.headlineColor}" font-size="${fontSizes.headline}" style="text-transform: uppercase; letter-spacing: -1px;">
    <text x="${headline.x}" y="${headline.y + fontSizes.headline}">${headlineTspans}</text>
  </g>

  ${
    zones.noSubheadline === true
      ? `<!-- subheadline omitted: format declares noSubheadline=true (Placement marker) -->`
      : `<g id="subheadline" font-family="${escapeSvg(textStyle.fontStack)}" font-weight="500" fill="${textStyle.subheadlineColor}" opacity="0.95" font-size="${fontSizes.subheadline}">
    <text x="${subheadline.x}" y="${subheadline.y + fontSizes.subheadline}">${subTspans}</text>
  </g>`
  }

  <g id="cta">
    <rect x="${zones.cta.x}" y="${zones.cta.y}" width="${zones.cta.width}" height="${zones.cta.height}" rx="${ctaRadius}" fill="${ctaStyle.background_color}"/>
    <text
      x="${zones.cta.x + zones.cta.width / 2}"
      y="${zones.cta.y + zones.cta.height / 2 + fontSizes.cta * 0.35}"
      text-anchor="middle"
      font-family="${escapeSvg(ctaStyle.font_family)}, ${escapeSvg(textStyle.fontStack)}"
      font-weight="${ctaStyle.font_weight}"
      font-size="${fontSizes.cta}"
      fill="${ctaStyle.color}"
      style="text-transform: uppercase; letter-spacing: 0.5px;"
    >${escapeSvg(copy.cta)}</text>
  </g>

  <g id="disclaimer" font-family="${escapeSvg(textStyle.fontStack)}" fill="${textStyle.disclaimerColor}" opacity="${textStyle.disclaimerOpacity}" font-size="${fontSizes.disclaimer}" text-anchor="middle">
    <text x="${zones.risk_msg.x + zones.risk_msg.width / 2}" y="${discFirstBaselineY}">${discTspans}</text>
  </g>
</svg>`;
}

async function fetchAsDataUri(src: string): Promise<string> {
  const res = await fetch(src);
  const blob = await res.blob();
  return new Promise<string>((resolve, reject) => {
    const fr = new FileReader();
    fr.onload = () => resolve(typeof fr.result === "string" ? fr.result : "");
    fr.onerror = reject;
    fr.readAsDataURL(blob);
  });
}

// Read the natural pixel dimensions of an image embedded as a data URI.
// Used by buildSvg to compute aspect-preserving bbox for the logo:
// Figma's SVG importer doesn't reliably honor `preserveAspectRatio`,
// so we pre-fit and emit explicit width/height that already match
// the image's natural aspect — that way Figma can't stretch it.
function getImageDimensions(dataUri: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth, h: img.naturalHeight });
    img.onerror = reject;
    img.src = dataUri;
  });
}

function fitAspect(
  source: { w: number; h: number },
  zone: { x: number; y: number; width: number; height: number },
): { x: number; y: number; width: number; height: number } {
  if (source.w <= 0 || source.h <= 0) {
    return { x: zone.x, y: zone.y, width: zone.width, height: zone.height };
  }
  const sourceAspect = source.w / source.h;
  const zoneAspect = zone.width / zone.height;
  let width: number;
  let height: number;
  if (sourceAspect > zoneAspect) {
    width = zone.width;
    height = width / sourceAspect;
  } else {
    height = zone.height;
    width = height * sourceAspect;
  }
  // Top-left anchor (matches the on-screen preview's objectPosition).
  return { x: zone.x, y: zone.y, width, height };
}

function triggerDownload(filename: string, content: string, mime: string) {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
