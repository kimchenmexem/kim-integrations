// Brand-aware prompt builder for Nano Banana.
//
// Encodes the same MEXEM brand rules used by the deterministic renderer
// (BANNER_REFERENCE_RULES.md §1-§7) into a text prompt that gives Nano
// Banana freedom to invent the visual *background* — but locks in:
//  - colors (navy gradient + yellow accent + white)
//  - tone (calm, professional, no hype)
//  - composition (text area reserved on left, no in-image text)
//  - exclusions (no clichés, no real people, no logos)
//
// The generated image is the background only. The headline, CTA, logo,
// and disclaimer are overlaid afterwards using the same MEXEM_ZONES
// positions as the deterministic pipeline.

import type { CampaignFormat } from "@/lib/schemas/campaignBrief.schema";

export const BRAND_COLORS = {
  navyDark: "#00122C",
  navyBright: "#006A97",
  accentYellow: "#F5C518",
  white: "#FFFFFF",
} as const;

const FORMAT_SIZE: Partial<Record<CampaignFormat, [number, number]>> = {
  "1200x628": [1200, 628],
  "1080x1080": [1080, 1080],
  "1080x1920": [1080, 1920],
  "1200x1200": [1200, 1200],
  "300x250": [300, 250],
  "336x280": [336, 280],
  "960x1200": [960, 1200],
  "728x90": [728, 90],
  "160x600": [160, 600],
  "250x250": [250, 250],
  "300x1050": [300, 1050],
  "300x600": [300, 600],
  "320x100": [320, 100],
  "320x50": [320, 50],
  "970x250": [970, 250],
};

export const NANO_BANANA_SUPPORTED_FORMATS = Object.keys(FORMAT_SIZE) as CampaignFormat[];

// Gemini's image API only accepts a fixed set of aspect ratios. Pick the
// closest preset to each banner format so the generated image fills the
// canvas with minimal cropping when displayed at the actual format size.
const GEMINI_PRESET_ASPECTS: ReadonlyArray<{ label: "1:1" | "16:9" | "9:16" | "4:3" | "3:4"; ratio: number }> = [
  { label: "1:1", ratio: 1 / 1 },
  { label: "16:9", ratio: 16 / 9 },
  { label: "9:16", ratio: 9 / 16 },
  { label: "4:3", ratio: 4 / 3 },
  { label: "3:4", ratio: 3 / 4 },
];

export function aspectRatioFor(format: CampaignFormat): "1:1" | "16:9" | "9:16" | "4:3" | "3:4" {
  const size = FORMAT_SIZE[format];
  if (!size) return "1:1";
  const [w, h] = size;
  const target = w / h;
  let best = GEMINI_PRESET_ASPECTS[0];
  let bestDelta = Math.abs(Math.log(target / best.ratio));
  for (const p of GEMINI_PRESET_ASPECTS) {
    const delta = Math.abs(Math.log(target / p.ratio));
    if (delta < bestDelta) {
      best = p;
      bestDelta = delta;
    }
  }
  return best.label;
}

function orientationLabel(width: number, height: number): string {
  if (width > height * 1.5) return "horizontal banner";
  if (height > width * 1.5) return "vertical banner";
  return "square banner";
}

export interface NanoPromptInput {
  format: CampaignFormat;
  campaignMessage: string;
  strategicIdea: string;
  tone: string;
  visualHint?: string;
}

export function buildBackgroundPrompt(input: NanoPromptInput): string {
  const size = FORMAT_SIZE[input.format];
  if (!size) {
    throw new Error(
      `Nano Banana doesn't have a layout for format "${input.format}". Supported: ${NANO_BANANA_SUPPORTED_FORMATS.join(", ")}`,
    );
  }
  const [w, h] = size;
  const lines: string[] = [
    `Generate a ${w}×${h} ${orientationLabel(w, h)} background image for MEXEM, a global investment trading platform.`,
    ``,
    `BRAND COLORS — use these EXACT hex values and NO others:`,
    `  • Primary background gradient: ${BRAND_COLORS.navyDark} (top-left) → ${BRAND_COLORS.navyBright} (bottom-right), 135° linear.`,
    `  • Accent yellow ${BRAND_COLORS.accentYellow}: sparing use for a single highlight element only.`,
    `  • Pure white ${BRAND_COLORS.white}: for any negative-space or stroke detail.`,
    ``,
    `MOOD / TONE:`,
    `  • ${input.tone}.`,
    `  • Calm, premium, professional. Platform-led — never hype-led.`,
    `  • Trustworthy, sophisticated, modern. Suitable for a regulated EU financial service.`,
    ``,
    `CONCEPT TO REPRESENT VISUALLY (do NOT write any of this as text — express it abstractly):`,
    `  • Strategic idea: ${input.strategicIdea}`,
    `  • Campaign message: ${input.campaignMessage}`,
  ];
  if (input.visualHint) {
    lines.push(`  • Creative direction: ${input.visualHint}`);
  }
  // Composition guidance depends on the canvas aspect — horizontal
  // banners reserve the LEFT for text+logo+CTA and put visuals on the
  // RIGHT; vertical banners reserve the TOP for text+logo+CTA and put
  // visuals on the BOTTOM; squares split top/bottom. Telling Gemini
  // the right composition per format produces dramatically better
  // results than a single one-size-fits-all rule.
  const reservedArea = w >= h * 1.3
    ? "the LEFT 50–55% of the canvas (text, logo, CTA will be overlaid in that region). Visual elements concentrate on the RIGHT side"
    : h >= w * 1.3
      ? "the TOP 55–65% of the canvas (logo and headline live there). Visual elements concentrate on the BOTTOM third"
      : "the TOP-LEFT 60% of the canvas (logo top, headline below it). Visual elements concentrate toward the BOTTOM-RIGHT";
  lines.push(
    ``,
    `COMPOSITION CONSTRAINTS (hard rules — these are calibrated to this format's aspect ratio):`,
    `  • Reserve ${reservedArea} or wrap subtly behind the reserved area at low opacity.`,
    `  • Absolutely NO text, letters, numbers, words, or typographic elements anywhere in the image.`,
    `  • No logos, brand marks, or watermarks.`,
    `  • No real human faces or recognizable people.`,
    ``,
    `CREATIVE LATITUDE (be inventive within the constraints):`,
    `  • Suggested visual vocabulary: abstract geometric trading motifs, candlestick silhouettes at low opacity, world-map fragments, light streaks, glowing UI fragments, isometric devices, abstract financial flow lines, subtle 3D depth.`,
    `  • Avoid clichés: NO money symbols, NO piles of coins, NO handshake imagery, NO bull/bear figures, NO stock chart with realistic ticker labels.`,
    `  • Produce exactly one cohesive composition — not a collage of disconnected elements.`,
    ``,
    `OUTPUT: a single ${w}×${h} pixel PNG. Background must fill the entire canvas — no transparency, no borders.`,
  );
  return lines.join("\n");
}
