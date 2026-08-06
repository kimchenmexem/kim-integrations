// POST /api/generate-nano-banner
//
// New, separate generation path that combines:
//   1. marketing-translator → localized copy (existing pipeline, unchanged).
//      One call per request, since copy is concept-level (locale-locked,
//      not format-locked).
//   2. Nano Banana (Gemini 2.5 Flash Image) → brand-aware creative
//      background. One call PER REQUESTED FORMAT, in parallel.
//   3. MEXEM zone overlay → logo + headline + CTA + disclaimer positioned
//      by the same fixed-zone rules the deterministic renderer uses.
//
// Per-format failures are isolated — a single Nano Banana error doesn't
// kill the rest of the batch; the failed format comes back with a `error`
// field so the UI can surface it next to the successful ones.
//
// This route is intentionally isolated — it does NOT touch
// /api/generate-campaign or any planCampaign/buildAdSpecsFromPlan logic.

import { promises as fs } from "node:fs";
import path from "node:path";
import { z } from "zod";
import { NextResponse } from "next/server";
import {
  fetchCampaignCopy,
  MarketingTranslatorError,
} from "@/lib/marketing-translator/client";
import {
  generateImage,
  NanoBananaConfigError,
} from "@/lib/nano-banana/client";
import {
  buildBackgroundPrompt,
  NANO_BANANA_SUPPORTED_FORMATS,
  aspectRatioFor,
} from "@/lib/nano-banana/prompts";
import sharp from "sharp";
import { MEXEM_ZONES, CTA_STYLE_INFO, type FormatZones } from "@/lib/formats/mexemZones";
import {
  CampaignFormatSchema,
  type CampaignFormat,
} from "@/lib/schemas/campaignBrief.schema";
import { LANG_META, type Language } from "@/lib/i18n/language";

// Brand-canonical text colors used by the deterministic pipeline. Repeated
// here so the Nano Banana preview matches the existing renderer exactly.
const BRAND_TEXT_STYLE = {
  headlineColor: "#FFFFFF",
  subheadlineColor: "#FFFFFF",
  disclaimerColor: "#FFFFFF",
  disclaimerOpacity: 0.85,
  backgroundFallback: "#00122C",
} as const;

// LANG_META is now keyed by the translator's BCP-47 locales directly, so the
// translator's `locale` maps 1:1 (Spanish, Belgian variants included). Falls
// back to en-GB only if an unexpected locale ever appears.
function langMetaForLocale(locale: string) {
  return LANG_META[locale as Language] ?? LANG_META["en-GB"];
}

const FormatSchema = CampaignFormatSchema.refine(
  (f) => (NANO_BANANA_SUPPORTED_FORMATS as readonly string[]).includes(f),
  { message: `Nano Banana supports: ${NANO_BANANA_SUPPORTED_FORMATS.join(", ")}` },
);

const BodySchema = z.object({
  formats: z.array(FormatSchema).min(1).max(15),
  targetLocale: z
    .enum(["en-GB", "fr-FR", "it-IT", "nl-NL", "nl-BE", "fr-BE", "es-ES"])
    .default("en-GB"),
  campaignMessage: z.string().min(8).max(400),
  campaignGoal: z
    .enum(["awareness", "consideration", "conversion", "retention"])
    .default("awareness"),
  strategicIdea: z.string().min(8).max(400),
  tone: z.string().min(2).max(120).default("calm and professional"),
  visualHint: z.string().max(400).optional(),
  // When true, ONE Gemini call at 1:1 produces a single source that's
  // smart-cropped to every checked format — cheap, but can lose visual
  // content on extreme aspects. When false (default), each format gets
  // its own Gemini call at its native aspect ratio so the composition
  // is correct for the canvas. Ignored when backgroundSource === "brand".
  sameImage: z.boolean().default(false),
  // "generate" (default): call Nano Banana to invent a creative
  // brand-compliant background per format. This is the section's
  // *purpose* — creative AI generation that respects MEXEM brand rules.
  // "brand": fall back to the pre-built brand background PNGs from
  // /public/brand-input-preview/backgrounds/background_<format>.png with
  // no Gemini call. Kept as an opt-out for when you need deterministic
  // output (free tier, no quota, exact brand reference).
  backgroundSource: z.enum(["brand", "generate"]).default("generate"),
});

// Per-format brand background PNGs live under public/brand-input-preview/
// backgrounds/. File name pattern is background_<format>.png and they're
// already copied into public/ so they serve directly.
function brandBackgroundFor(format: string): string {
  return `/brand-input-preview/backgrounds/background_${format}.png`;
}

// Smart-crop + resize a source PNG to exactly (w, h). Used in sameImage
// mode so each format gets a pre-sized background derived from the ONE
// Gemini call — avoiding the CSS object-fit catastrophe where a 16:9
// source gets squished into a 9:16 portrait. `fit: cover` + center
// position keeps the focal area centered; sharp's `position: attention`
// would pick the most-salient region but its saliency model isn't
// always reliable for abstract banners, so center crop is the safer
// default.
function formatPixels(format: string): { width: number; height: number } {
  const [w, h] = format.split("x").map((n) => parseInt(n, 10));
  return { width: w, height: h };
}

async function resizeToFormat(
  sourceBuffer: Buffer,
  format: string,
): Promise<Buffer> {
  const { width, height } = formatPixels(format);
  return sharp(sourceBuffer)
    .resize(width, height, { fit: "cover", position: "center" })
    .png()
    .toBuffer();
}

// ── QA layer ────────────────────────────────────────────────────────────
//
// Cheap, deterministic image-stats checks that run after every Gemini
// generation. The goal is to catch *obviously* off-brand outputs — flat
// gray rectangles, warm-toned images, fully-white blanks, etc. — without
// invoking a vision LLM. Each check that fails contributes to a retry.
//
// Rules encoded:
//   • brand-navy dominant       — image must lean blue: avg B > avg R
//   • not too dark / too bright — luminance in [15, 200]
//   • non-uniform               — combined RGB stdev > 30 (a blank
//                                 single-color image has stdev ≈ 0)
//   • no warm hue dominance     — avg R should not exceed avg B
//
// Brand mode + per-format-resize crops aren't QA'd separately — their
// content is identical to the source, so source QA is the gate.

interface QaCheck {
  id: string;
  pass: boolean;
  detail: string;
}

interface QaResult {
  pass: boolean;
  attempts: number;
  checks: QaCheck[];
}

async function qaImageStats(
  buffer: Buffer,
  prefix: string,
): Promise<{ pass: boolean; checks: QaCheck[] }> {
  const stats = await sharp(buffer).stats();
  const ch = stats.channels;
  const avgR = ch[0]?.mean ?? 0;
  const avgG = ch[1]?.mean ?? 0;
  const avgB = ch[2]?.mean ?? 0;
  const stdevTotal =
    (ch[0]?.stdev ?? 0) + (ch[1]?.stdev ?? 0) + (ch[2]?.stdev ?? 0);
  const luminance = 0.299 * avgR + 0.587 * avgG + 0.114 * avgB;
  const checks: QaCheck[] = [
    {
      id: `${prefix}/navy-dominant`,
      pass: avgB > avgR,
      detail: `avg rgb=(${avgR.toFixed(0)},${avgG.toFixed(0)},${avgB.toFixed(0)})`,
    },
    {
      id: `${prefix}/not-too-warm`,
      pass: avgR <= avgB + 10,
      detail: `R-B gap=${(avgR - avgB).toFixed(0)}`,
    },
    {
      id: `${prefix}/luminance-in-range`,
      pass: luminance >= 15 && luminance <= 200,
      detail: `lum=${luminance.toFixed(0)} (want 15..200)`,
    },
    {
      id: `${prefix}/non-uniform`,
      pass: stdevTotal > 30,
      detail: `Σstdev=${stdevTotal.toFixed(0)} (want >30)`,
    },
  ];
  return { pass: checks.every((c) => c.pass), checks };
}

// Minimum readable font sizes (px) per role, calibrated against the
// brand-input SVG references. Brand routinely renders disclaimer + CTA
// text below 6 px on micro IAB formats (e.g. 320×50.svg uses 5.23 px
// disclaimer, 320×100.svg uses 3.87 px disclaimer and 3.77 px CTA) —
// that's the practical floor for those placement slots. Lowering these
// brings QA in line with brand convention so micro formats stop
// failing on disclaimer-doesn't-fit when the brand itself ships them
// at 5 px.
const MIN_READABLE_FONT = {
  headline: 12,
  subheadline: 9,
  cta: 4,
  disclaimer: 5,
};

// The subheadline overlay is dropped on Placement-marker formats. The
// canonical contract lives in MEXEM_ZONES → `noSubheadline: true` (set
// for 728×90, 320×100, and 320×50). The sub-slot height inside the
// `text` zone is still computed so the QA "skipped" message can quote
// the actual slot dimensions.
function subheadlineSlotHeightFor(textZoneHeight: number): number {
  return Math.round(textZoneHeight * 0.85) - Math.round(textZoneHeight * 0.6);
}

// Returns true iff `text` fits in `slotW × slotH` at >= `min` font size.
// Matches the fitFontSize math in NanoBananaPreview but inverted —
// we check feasibility rather than picking a value.
function textFits(
  text: string,
  slotW: number,
  slotH: number,
  opts: {
    charWidth: number;
    lineHeight: number;
    min: number;
    maxLines: number;
  },
): { fits: boolean; maxFont: number; lines: number } {
  const chars = Math.max(1, text.length);
  const linesByHeight = Math.max(
    1,
    Math.floor(slotH / (opts.min * opts.lineHeight)),
  );
  const lines = Math.min(opts.maxLines, linesByHeight);
  const byWidth = (slotW * lines) / (chars * opts.charWidth);
  const byHeight = slotH / (lines * opts.lineHeight);
  const maxFont = Math.min(byWidth, byHeight);
  return { fits: maxFont >= opts.min, maxFont, lines };
}

function qaLayoutFit(args: {
  zones: FormatZones;
  copy: { headline: string; subheadline: string; cta: string; disclaimer: string };
  charWidthRatio: number;
}): { pass: boolean; checks: QaCheck[] } {
  const { zones, copy, charWidthRatio: cw } = args;
  const textH = zones.text.height;
  // Headline = top 60% of text zone; subheadline = next 25%.
  const headlineSlot = { w: zones.text.width, h: Math.round(textH * 0.6) };
  const subSlot = { w: zones.text.width, h: subheadlineSlotHeightFor(textH) };
  // Canonical: the noSubheadline flag in MEXEM_ZONES decides whether
  // the subheadline overlay renders. True only for Placement-marker
  // formats (728×90, 320×100, 320×50).
  const subRenders = zones.noSubheadline !== true;

  const headlineFit = textFits(copy.headline, headlineSlot.w, headlineSlot.h, {
    charWidth: cw,
    lineHeight: 1.05,
    min: MIN_READABLE_FONT.headline,
    maxLines: 2,
  });
  const ctaFit = textFits(copy.cta, zones.cta.width - 24, zones.cta.height, {
    charWidth: cw + 0.05,
    lineHeight: 1.1,
    min: MIN_READABLE_FONT.cta,
    maxLines: 1,
  });
  const discFit = textFits(
    copy.disclaimer,
    zones.risk_msg.width - 40,
    zones.risk_msg.height,
    {
      charWidth: cw - 0.05,
      lineHeight: 1.2,
      min: MIN_READABLE_FONT.disclaimer,
      maxLines: 2,
    },
  );

  const checks: QaCheck[] = [
    {
      id: "layout/headline-readable",
      pass: headlineFit.fits,
      detail: `${copy.headline.length} chars in ${headlineSlot.w}×${headlineSlot.h}, max font ${headlineFit.maxFont.toFixed(1)}px (need ≥${MIN_READABLE_FONT.headline}px)`,
    },
    {
      id: "layout/cta-readable",
      pass: ctaFit.fits,
      detail: `${copy.cta.length} chars in ${zones.cta.width}×${zones.cta.height}, max font ${ctaFit.maxFont.toFixed(1)}px (need ≥${MIN_READABLE_FONT.cta}px)`,
    },
    {
      id: "layout/disclaimer-readable",
      pass: discFit.fits,
      // When the disclaimer fits but well below the comfortable-reading
      // floor (≈ 8 px), flag it explicitly as "rendered as fine print
      // per brand convention" so the operator knows it's not legible at
      // 100% — it's the same compromise brand's own micro-banner SVGs
      // make (320×50.svg uses 5.23 px disclaimer).
      detail: discFit.maxFont < 8 && discFit.fits
        ? `${copy.disclaimer.length} chars in ${zones.risk_msg.width}×${zones.risk_msg.height}, max font ${discFit.maxFont.toFixed(1)}px — rendered as fine print per brand convention (legibility ≥${MIN_READABLE_FONT.disclaimer}px)`
        : `${copy.disclaimer.length} chars in ${zones.risk_msg.width}×${zones.risk_msg.height}, max font ${discFit.maxFont.toFixed(1)}px (need ≥${MIN_READABLE_FONT.disclaimer}px)`,
    },
  ];

  // Subheadline check only applies when the sub-slot is tall enough to
  // host any text. Micro-banner formats (sub-slot < 12 px tall) drop
  // the subheadline entirely — matches brand convention on 320×50 /
  // 320×100, which show no subheadline.
  if (subRenders) {
    const subFit = textFits(copy.subheadline, subSlot.w, subSlot.h, {
      charWidth: cw - 0.05,
      lineHeight: 1.2,
      min: MIN_READABLE_FONT.subheadline,
      maxLines: 2,
    });
    checks.splice(1, 0, {
      id: "layout/subheadline-readable",
      pass: subFit.fits,
      detail: `${copy.subheadline.length} chars in ${subSlot.w}×${subSlot.h}, max font ${subFit.maxFont.toFixed(1)}px (need ≥${MIN_READABLE_FONT.subheadline}px)`,
    });
  } else {
    checks.splice(1, 0, {
      id: "layout/subheadline-skipped",
      pass: true,
      detail: `format opts out of subheadline (noSubheadline=true); sub-slot would be ${subSlot.h}px tall`,
    });
  }
  return { pass: checks.every((c) => c.pass), checks };
}

const MAX_QA_RETRIES = 2;

// Generate an image with up to MAX_QA_RETRIES attempts, accepting the
// first one that passes QA. If every attempt fails, returns the LAST
// buffer with `pass: false` so the user still sees something AND knows
// what's wrong (better than throwing).
async function generateWithQa(
  prompt: string,
  aspectRatio: "1:1" | "16:9" | "9:16" | "4:3" | "3:4",
): Promise<{ buffer: Buffer; qa: QaResult }> {
  let lastBuffer: Buffer | null = null;
  let lastChecks: QaCheck[] = [];
  for (let attempt = 1; attempt <= MAX_QA_RETRIES; attempt++) {
    const image = await generateImage(prompt, { aspectRatio });
    const buffer = Buffer.from(image.imageBase64, "base64");
    const result = await qaImageStats(buffer, "source");
    lastBuffer = buffer;
    lastChecks = result.checks;
    if (result.pass) {
      return { buffer, qa: { pass: true, attempts: attempt, checks: result.checks } };
    }
  }
  return {
    buffer: lastBuffer!,
    qa: { pass: false, attempts: MAX_QA_RETRIES, checks: lastChecks },
  };
}

// Merge multiple QA passes into one combined report.
function combineQa(
  attempts: number,
  ...reports: { pass: boolean; checks: QaCheck[] }[]
): QaResult {
  const checks = reports.flatMap((r) => r.checks);
  return {
    pass: reports.every((r) => r.pass),
    attempts,
    checks,
  };
}


interface BannerSuccess {
  status: "ok";
  format: CampaignFormat;
  imagePath: string;
  prompt: string;
  zones: (typeof MEXEM_ZONES)[CampaignFormat];
  qa?: QaResult;
}

interface BannerFailure {
  status: "error";
  format: CampaignFormat;
  error: string;
}

type BannerResult = BannerSuccess | BannerFailure;

export async function POST(req: Request) {
  let body: z.infer<typeof BodySchema>;
  try {
    body = BodySchema.parse(await req.json());
  } catch (err) {
    return NextResponse.json(
      { error: "invalid_request", details: (err as Error).message },
      { status: 400 },
    );
  }

  // Step 1 — copy from marketing-translator (one call, shared across
  // formats). If the returned copy fails the layout-fit QA for any
  // checked format (e.g. CTA too long for a 50×12 px pill), retry the
  // translator with a "compact copy" hint appended to the tone. Cap at
  // MAX_COPY_RETRIES so we don't burn the translator's quota chasing an
  // unwinnable case (brand-canonical disclaimer just doesn't fit on
  // micro-banners regardless of how we tune the rest of the copy).
  const MAX_COPY_RETRIES = 3;

  // Pre-resolve locale-locked brand text. The brand-canonical disclaimer
  // is fixed per locale — the translator can't shorten it — so layout
  // checks always run against this exact string.
  let copy;
  let copyAttempts = 0;
  let bestCopy: Awaited<ReturnType<typeof fetchCampaignCopy>> | null = null;
  let bestLayoutFailures = Infinity;
  let translatorTone = body.tone;

  for (copyAttempts = 1; copyAttempts <= MAX_COPY_RETRIES; copyAttempts++) {
    try {
      copy = await fetchCampaignCopy({
        brief: {
          marketingMessage: body.campaignMessage,
          campaignGoal: body.campaignGoal,
        },
        targetLocale: body.targetLocale,
        tone: translatorTone,
        conceptHint: { strategicIdea: body.strategicIdea },
      });
    } catch (err) {
      const status = err instanceof MarketingTranslatorError ? 502 : 503;
      return NextResponse.json(
        { error: "marketing_translator_failed", details: (err as Error).message },
        { status },
      );
    }

    // Check layout-fit across every requested format using THIS copy.
    const langMeta = langMetaForLocale(copy.locale);
    const disclaimerForCheck = langMeta.fallbackDisclaimer.endsWith("*")
      ? langMeta.fallbackDisclaimer
      : `${langMeta.fallbackDisclaimer.replace(/\.\s*$/, "")}*`;
    let totalLayoutFailures = 0;
    for (const format of body.formats) {
      const zones = MEXEM_ZONES[format];
      if (!zones) continue;
      const lf = qaLayoutFit({
        zones,
        copy: {
          headline: copy.headline,
          subheadline: copy.subheadline,
          cta: copy.cta,
          disclaimer: disclaimerForCheck,
        },
        charWidthRatio: langMeta.charWidthRatio,
      });
      totalLayoutFailures += lf.checks.filter((c) => !c.pass).length;
    }

    // Keep the BEST attempt (fewest layout failures) regardless of
    // whether we stop or retry — so even if we never get a perfect fit
    // we ship the closest approximation.
    if (totalLayoutFailures < bestLayoutFailures) {
      bestLayoutFailures = totalLayoutFailures;
      bestCopy = copy;
    }

    // Done — every format's text fits at readable size.
    if (totalLayoutFailures === 0) break;

    // Retry with a progressively stricter "compact copy" hint appended
    // to the tone. We can't shorten the brand disclaimer (it's locked
    // by LANG_META), so retries can only help the CTA / headline /
    // subheadline. Disclaimer-only failures on micro-banners are
    // unrecoverable and the loop will exit at MAX_COPY_RETRIES.
    translatorTone = `${body.tone}. CRITICAL: produce VERY SHORT copy for micro-banner formats. CTA: max 2 words, ideally 1 word (e.g. "Start", "Open", "Trade"). Headline: max 24 characters. Subheadline: max 36 characters. The text must read clearly at extremely small sizes.`;
  }
  copy = bestCopy!;
  const langMeta = langMetaForLocale(copy.locale);
  const disclaimerWithAsterisk = langMeta.fallbackDisclaimer.endsWith("*")
    ? langMeta.fallbackDisclaimer
    : `${langMeta.fallbackDisclaimer.replace(/\.\s*$/, "")}*`;

  // Step 2 — assemble per-format banners.
  //
  // backgroundSource modes:
  //   "brand"    → use the per-format PNG from /brand-input-preview/
  //                backgrounds/background_<format>.png. NO Gemini call.
  //                Zero API cost, sub-second response.
  //   "generate" → call Nano Banana. Two sub-modes:
  //     - sameImage=true  → ONE Gemini call, image reused for all formats
  //                         (cheapest creative path)
  //     - sameImage=false → ONE call per format, sequential, with each
  //                         format's own aspect ratio
  const outDir = path.join(process.cwd(), "public", "nano-banana");
  await fs.mkdir(outDir, { recursive: true });
  const batchId = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 7)}`;
  const INTER_FORMAT_DELAY_MS = 800;

  const banners: BannerResult[] = [];

  // Layout-fit checks only depend on the format + the (locale-fixed)
  // copy strings — not on the image. Run once per requested format and
  // attach to every banner. This is what catches formats where the
  // translator's CTA / disclaimer mathematically can't be drawn at a
  // readable size (e.g. "Explore Our Platform" in a 50×12 px CTA pill).
  const layoutFitByFormat = new Map<string, { pass: boolean; checks: QaCheck[] }>();
  const layoutCopy = {
    headline: copy.headline,
    subheadline: copy.subheadline,
    cta: copy.cta,
    disclaimer: disclaimerWithAsterisk,
  };
  for (const format of body.formats) {
    const zones = MEXEM_ZONES[format];
    if (zones) {
      layoutFitByFormat.set(
        format,
        qaLayoutFit({
          zones,
          copy: layoutCopy,
          charWidthRatio: langMeta.charWidthRatio,
        }),
      );
    }
  }

  if (body.backgroundSource === "brand") {
    // Mode: per-format brand PNG from disk. The "prompt" returned for
    // each banner is the prompt we WOULD have sent had the user picked
    // "generate" — useful for transparency / debugging — but no Gemini
    // call is made.
    for (const format of body.formats) {
      let prompt = "";
      try {
        prompt = buildBackgroundPrompt({
          format,
          campaignMessage: body.campaignMessage,
          strategicIdea: body.strategicIdea,
          tone: body.tone,
          visualHint: body.visualHint,
        });
      } catch {
        /* if a format is unsupported by prompts.ts, prompt stays empty */
      }
      const layoutQa = layoutFitByFormat.get(format) ?? { pass: true, checks: [] };
      banners.push({
        status: "ok",
        format,
        imagePath: brandBackgroundFor(format),
        prompt,
        zones: MEXEM_ZONES[format]!,
        qa: combineQa(copyAttempts, layoutQa),
      });
    }
  } else if (body.sameImage) {
    // Mode A: ONE Gemini call. The source image is generated at 1:1
    // (most adaptable aspect — equally croppable to wide, square, or
    // tall) and then sharp-resized per format so every banner gets a
    // pre-sized PNG at its exact canvas dimensions. This avoids the
    // CSS object-fit cropping that destroyed extreme-aspect formats
    // (16:9 source butchered into 9:16 portrait, etc.).
    const primary = body.formats[0];
    let prompt: string;
    try {
      prompt = buildBackgroundPrompt({
        format: primary,
        campaignMessage: body.campaignMessage,
        strategicIdea: body.strategicIdea,
        tone: body.tone,
        visualHint: body.visualHint,
      });
    } catch (err) {
      return NextResponse.json(
        { error: "prompt_build_failed", details: (err as Error).message },
        { status: 400 },
      );
    }

    let sourceBuffer: Buffer | null = null;
    let sharedPath: string | null = null;
    let imageError: string | null = null;
    let sharedQa: QaResult | undefined;
    try {
      const { buffer, qa } = await generateWithQa(prompt, "1:1");
      sourceBuffer = buffer;
      sharedQa = qa;
      // Save the source 1024×1024 for transparency / debugging.
      const sourceFilename = `${batchId}_shared.png`;
      await fs.writeFile(path.join(outDir, sourceFilename), sourceBuffer);
      sharedPath = `/nano-banana/${sourceFilename}`;
    } catch (err) {
      const isConfig = err instanceof NanoBananaConfigError;
      imageError = `${isConfig ? "config: " : ""}${(err as Error).message}`;
    }

    for (const format of body.formats) {
      if (!sourceBuffer || !sharedPath) {
        banners.push({
          status: "error",
          format,
          error: imageError ?? "image generation failed",
        });
        continue;
      }
      // Smart-crop + resize the source to this format's exact canvas.
      try {
        const resized = await resizeToFormat(sourceBuffer, format);
        const filename = `${batchId}_${format}.png`;
        await fs.writeFile(path.join(outDir, filename), resized);
        // QA the per-format crop — the cropped strip can be radically
        // different from the source (e.g. 1024×1024 → 320×50 is a thin
        // horizontal slice that may have lost all visual interest).
        const cropQa = await qaImageStats(resized, `crop:${format}`);
        const layoutQa = layoutFitByFormat.get(format) ?? { pass: true, checks: [] };
        const sourceReport = sharedQa ?? { pass: true, attempts: 0, checks: [] };
        banners.push({
          status: "ok",
          format,
          imagePath: `/nano-banana/${filename}`,
          prompt,
          zones: MEXEM_ZONES[format]!,
          qa: combineQa(
            sourceReport.attempts + copyAttempts,
            sourceReport,
            cropQa,
            layoutQa,
          ),
        });
      } catch (err) {
        banners.push({
          status: "error",
          format,
          error: `resize failed: ${(err as Error).message}`,
        });
      }
    }
  } else {
    // Mode B: one Gemini call per format.
    let quotaHit = false;
    for (let i = 0; i < body.formats.length; i++) {
      const format = body.formats[i];
      if (quotaHit) {
        banners.push({
          status: "error",
          format,
          error: "skipped: prior format hit quota (429); not consuming more quota",
        });
        continue;
      }
      if (i > 0) {
        await new Promise((r) => setTimeout(r, INTER_FORMAT_DELAY_MS));
      }

      let prompt: string;
      try {
        prompt = buildBackgroundPrompt({
          format,
          campaignMessage: body.campaignMessage,
          strategicIdea: body.strategicIdea,
          tone: body.tone,
          visualHint: body.visualHint,
        });
      } catch (err) {
        banners.push({ status: "error", format, error: (err as Error).message });
        continue;
      }

      try {
        const { buffer, qa } = await generateWithQa(
          prompt,
          aspectRatioFor(format),
        );
        // Resize the raw Gemini buffer (e.g. 1408×768 for 16:9 preset)
        // to the EXACT canvas dimensions of this format so the saved
        // PNG matches the banner size 1:1 — no browser-side scaling,
        // no preview aspect drift, sharp-quality crop where preset
        // and canvas aspects differ.
        const resized = await resizeToFormat(buffer, format);
        const filename = `${batchId}_${format}.png`;
        await fs.writeFile(path.join(outDir, filename), resized);
        const layoutQa = layoutFitByFormat.get(format) ?? { pass: true, checks: [] };
        banners.push({
          status: "ok",
          format,
          imagePath: `/nano-banana/${filename}`,
          prompt,
          zones: MEXEM_ZONES[format]!,
          qa: combineQa(qa.attempts + copyAttempts, qa, layoutQa),
        });
      } catch (err) {
        const message = (err as Error).message;
        const isConfig = err instanceof NanoBananaConfigError;
        const is429 = /\(429\)/.test(message);
        if (is429) quotaHit = true;
        banners.push({
          status: "error",
          format,
          error: `${isConfig ? "config: " : ""}${message}`,
        });
      }
    }
  }

  // If literally every format failed, return 502 so the UI knows none rendered.
  const anyOk = banners.some((b) => b.status === "ok");
  if (!anyOk) {
    return NextResponse.json(
      {
        error: "all_formats_failed",
        details: banners.map((b) => (b.status === "error" ? b.error : "")).join("; "),
      },
      { status: 502 },
    );
  }

  // Override marketing-translator's disclaimer with the brand-canonical
  // compliance string per locale. The translator's freeform disclaimer can
  // run 200+ chars; the brand uses a single fixed sentence in each market.
  // The brand SVGs (e.g. brand-input/banner-examples/1200 X 629.svg) end
  // the disclaimer with a trailing asterisk. `disclaimerWithAsterisk` is
  // computed near the top of this handler so the layout-fit QA pass can
  // use the exact final string.

  // Include zones for EVERY supported format so the client can offer
  // "apply this design to all sizes" without an extra round-trip.
  const all_zones: Record<string, FormatZones> = {};
  for (const f of NANO_BANANA_SUPPORTED_FORMATS) {
    all_zones[f] = MEXEM_ZONES[f]!;
  }

  return NextResponse.json({
    batchId,
    locale: copy.locale,
    direction: copy.direction,
    copy: {
      headline: copy.headline,
      subheadline: copy.subheadline,
      cta: copy.cta,
      disclaimer: disclaimerWithAsterisk,
    },
    cta_style: CTA_STYLE_INFO,
    text_style: {
      ...BRAND_TEXT_STYLE,
      fontStack: langMeta.fontStack,
      charWidthRatio: langMeta.charWidthRatio,
    },
    all_zones,
    supported_formats: NANO_BANANA_SUPPORTED_FORMATS,
    banners,
  });
}

export const maxDuration = 120;
export const dynamic = "force-dynamic";
