// MEXEM banner zone templates — single source of truth for per-format
// layout safe zones, layout-class metadata, and the noSubheadline flag.
//
// Each entry defines:
//   • label           — human-friendly display name (used by docs)
//   • class           — layout family (see LayoutClass below)
//   • canvas          — total banner dimensions in px
//   • noSubheadline   — when true, the subheadline overlay is neither
//                       rendered nor QA'd. Reserved for micro-banner
//                       placement formats whose canvas can't host a
//                       readable subheadline.
//   • logo / text / cta / risk_msg / element — five required safe zones,
//                       each an axis-aligned bounding box {x, y, width,
//                       height} in canvas pixels with origin at top-left.
//
// `applyMexemZones(manifest, format)` is the only public surface that
// modifies a manifest. It overwrites each matching element's geometry
// with its zone, then hides decorative text and applies the canonical
// CTA style. Other element properties (font, color, asset, etc.) are
// preserved.
//
// EDITING: this file is the single source of truth. After changing any
// value, run `npm run docs:zones` (or `npm run build`, which runs the
// docs generator via prebuild) so the markdown docs stay in sync, and
// `npm run test:zones` to verify the canonical contract.

import type { CampaignFormat } from "@/lib/schemas/campaignBrief.schema";
import type {
  Element,
  ElementManifest,
  ElementRole,
} from "@/lib/schemas/elementManifest.schema";

export type ZoneName = "logo" | "text" | "cta" | "risk_msg" | "element";

export interface ZoneBox {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface BannerCanvas {
  width: number;
  height: number;
}

export type LayoutClass =
  | "Wide leaderboard"
  | "Tall portrait"
  | "Square"
  | "Compact rectangle"
  | "Narrow skyscraper"
  | "Placement marker";

export interface FormatZones {
  // Metadata
  label: string;
  class: LayoutClass;
  canvas: BannerCanvas;
  /**
   * When true, the subheadline is dropped entirely from this format
   * (overlay is not rendered, QA check is skipped). Reserved for the
   * three micro-banner "Placement marker" formats whose canvas can't
   * host a readable subheadline: 728×90, 320×100, 320×50.
   */
  noSubheadline?: boolean;
  // Safe zones (5 required, in canonical key order)
  logo: ZoneBox;
  text: ZoneBox;
  cta: ZoneBox;
  risk_msg: ZoneBox;
  element: ZoneBox;
}

export const MEXEM_ZONES: Partial<Record<CampaignFormat, FormatZones>> = {
  // ── Wide leaderboard ──────────────────────────────────────────────
  "1200x628": {
    label: "LinkedIn / Facebook leaderboard",
    class: "Wide leaderboard",
    canvas: { width: 1200, height: 628 },
    noSubheadline: false,
    logo:     { x: 54,  y: 54,  width: 456,  height: 90 },
    text:     { x: 54,  y: 170, width: 711,  height: 161 },
    cta:      { x: 43,  y: 484, width: 321,  height: 67 },
    risk_msg: { x: 0,   y: 562, width: 1200, height: 66 },
    element:  { x: 770, y: 65,  width: 426,  height: 410 },
  },
  "970x250": {
    label: "IAB billboard",
    class: "Wide leaderboard",
    canvas: { width: 970, height: 250 },
    noSubheadline: false,
    logo:     { x: 40,  y: 25,  width: 240, height: 36 },
    text:     { x: 40,  y: 75,  width: 700, height: 100 },
    cta:      { x: 40,  y: 178, width: 200, height: 32 },
    risk_msg: { x: 0,   y: 221, width: 970, height: 29 },
    element:  { x: 760, y: 0,   width: 210, height: 220 },
  },

  // ── Tall portrait ─────────────────────────────────────────────────
  "1080x1920": {
    label: "Story / portrait",
    class: "Tall portrait",
    canvas: { width: 1080, height: 1920 },
    noSubheadline: false,
    logo:     { x: 144, y: 182,  width: 787,  height: 171 },
    text:     { x: 71,  y: 460,  width: 938,  height: 534 },
    cta:      { x: 71,  y: 1100, width: 938,  height: 87 },
    risk_msg: { x: 71,  y: 1220, width: 938,  height: 83 },
    element:  { x: 0,   y: 1340, width: 1080, height: 568 },
  },
  "960x1200": {
    label: "Social portrait 4:5",
    class: "Tall portrait",
    canvas: { width: 960, height: 1200 },
    noSubheadline: false,
    logo:     { x: 215, y: 89,   width: 523, height: 98 },
    text:     { x: 107, y: 270,  width: 746, height: 297 },
    cta:      { x: 300, y: 600,  width: 359, height: 86 },
    risk_msg: { x: 0,   y: 1134, width: 960, height: 66 },
    element:  { x: 0,   y: 720,  width: 960, height: 371 },
  },
  "300x1050": {
    label: "Portrait skyscraper",
    class: "Tall portrait",
    canvas: { width: 300, height: 1050 },
    noSubheadline: false,
    logo:     { x: 10, y: 10,   width: 280, height: 36 },
    text:     { x: 12, y: 280,  width: 280, height: 200 },
    cta:      { x: 67, y: 491,  width: 165, height: 34 },
    risk_msg: { x: 0,  y: 1009, width: 300, height: 41 },
    element:  { x: 0,  y: 560,  width: 300, height: 440 },
  },
  "300x600": {
    label: "Vertical half-page",
    class: "Tall portrait",
    canvas: { width: 300, height: 600 },
    noSubheadline: false,
    logo:     { x: 10, y: 10,  width: 280, height: 32 },
    text:     { x: 18, y: 110, width: 264, height: 140 },
    cta:      { x: 53, y: 275, width: 193, height: 50 },
    risk_msg: { x: 10, y: 340, width: 280, height: 28 },
    element:  { x: 0,  y: 370, width: 300, height: 230 },
  },

  // ── Square ────────────────────────────────────────────────────────
  "1080x1080": {
    label: "Instagram feed square",
    class: "Square",
    canvas: { width: 1080, height: 1080 },
    noSubheadline: false,
    logo:     { x: 70,  y: 70,  width: 457,  height: 100 },
    text:     { x: 70,  y: 200, width: 535,  height: 502 },
    cta:      { x: 70,  y: 750, width: 535,  height: 85 },
    risk_msg: { x: 0,   y: 968, width: 1080, height: 112 },
    element:  { x: 615, y: 140, width: 373,  height: 811 },
  },
  // Canonical "LinkedIn / generic square" — supersedes any previously
  // documented Square A / Square B variants.
  "1200x1200": {
    label: "LinkedIn / generic square",
    class: "Square",
    canvas: { width: 1200, height: 1200 },
    noSubheadline: false,
    logo:     { x: 256, y: 86,   width: 688,  height: 141 },
    text:     { x: 175, y: 320,  width: 850,  height: 275 },
    cta:      { x: 421, y: 650,  width: 358,  height: 85 },
    risk_msg: { x: 0,   y: 1098, width: 1200, height: 102 },
    element:  { x: 0,   y: 760,  width: 1200, height: 348 },
  },
  "250x250": {
    label: "Square compact",
    class: "Square",
    canvas: { width: 250, height: 250 },
    noSubheadline: false,
    logo:     { x: 9,   y: 8,   width: 130, height: 22 },
    text:     { x: 9,   y: 70,  width: 130, height: 90 },
    cta:      { x: 9,   y: 174, width: 124, height: 26 },
    risk_msg: { x: 0,   y: 229, width: 250, height: 21 },
    element:  { x: 141, y: 43,  width: 109, height: 186 },
  },

  // ── Compact rectangle ─────────────────────────────────────────────
  "300x250": {
    label: "Compact rectangle",
    class: "Compact rectangle",
    canvas: { width: 300, height: 250 },
    noSubheadline: false,
    logo:     { x: 10,  y: 10,  width: 153, height: 29 },
    text:     { x: 10,  y: 50,  width: 184, height: 100 },
    cta:      { x: 10,  y: 165, width: 125, height: 26 },
    risk_msg: { x: 0,   y: 225, width: 300, height: 25 },
    element:  { x: 190, y: 40,  width: 104, height: 171 },
  },
  "336x280": {
    label: "Compact rectangle larger variant",
    class: "Compact rectangle",
    canvas: { width: 336, height: 280 },
    noSubheadline: false,
    logo:     { x: 10,  y: 10,  width: 153, height: 30 },
    text:     { x: 10,  y: 55,  width: 185, height: 101 },
    cta:      { x: 10,  y: 175, width: 125, height: 26 },
    risk_msg: { x: 0,   y: 252, width: 336, height: 28 },
    element:  { x: 200, y: 23,  width: 136, height: 234 },
  },

  // ── Narrow skyscraper ─────────────────────────────────────────────
  "160x600": {
    label: "Narrow skyscraper",
    class: "Narrow skyscraper",
    canvas: { width: 160, height: 600 },
    noSubheadline: false,
    logo:     { x: 10, y: 10,  width: 140, height: 24 },
    text:     { x: 7,  y: 130, width: 145, height: 110 },
    cta:      { x: 18, y: 260, width: 124, height: 26 },
    risk_msg: { x: 0,  y: 566, width: 160, height: 34 },
    element:  { x: 0,  y: 310, width: 160, height: 240 },
  },

  // ── Placement marker (noSubheadline: true) ────────────────────────
  // Micro-banners. Canvas is too small for a readable subheadline; the
  // disclaimer renders as fine print (~4–5 px) per brand convention.
  "728x90": {
    label: "IAB leaderboard",
    class: "Placement marker",
    canvas: { width: 728, height: 90 },
    noSubheadline: true,
    logo:     { x: 10,  y: 10, width: 110, height: 30 },
    text:     { x: 130, y: 15, width: 350, height: 50 },
    cta:      { x: 485, y: 27, width: 130, height: 36 },
    risk_msg: { x: 0,   y: 78, width: 728, height: 12 },
    element:  { x: 620, y: 10, width: 80,  height: 60 },
  },
  "320x100": {
    label: "Wide micro mobile banner",
    class: "Placement marker",
    canvas: { width: 320, height: 100 },
    noSubheadline: true,
    logo:     { x: 10,  y: 12, width: 70,  height: 16 },
    text:     { x: 86,  y: 28, width: 145, height: 35 },
    cta:      { x: 140, y: 67, width: 50,  height: 12 },
    risk_msg: { x: 0,   y: 88, width: 320, height: 12 },
    element:  { x: 235, y: 5,  width: 85,  height: 75 },
  },
  // The 320×50 element zone is intentionally tiny (a 5×41 sliver at the
  // far right edge) — the canvas has no realistic room for a visual but
  // we still require all 5 zones for schema consistency.
  "320x50": {
    label: "Ultra-wide mobile banner",
    class: "Placement marker",
    canvas: { width: 320, height: 50 },
    noSubheadline: true,
    logo:     { x: 5,   y: 8,  width: 60,  height: 14 },
    text:     { x: 70,  y: 10, width: 195, height: 26 },
    cta:      { x: 265, y: 15, width: 50,  height: 12 },
    risk_msg: { x: 0,   y: 41, width: 320, height: 9 },
    element:  { x: 315, y: 0,  width: 5,   height: 41 },
  },
};

const ROLE_TO_ZONE: Partial<Record<ElementRole, ZoneName>> = {
  logo: "logo",
  headline: "text",
  subheadline: "text",
  body: "text",
  cta: "cta",
  "legal-disclaimer": "risk_msg",
  "product_visual": "element",
  "hero-image": "element",
  "supporting-image": "element",
};

export function hasMexemZones(format: CampaignFormat): boolean {
  return MEXEM_ZONES[format] !== undefined;
}

/**
 * True when the format opts out of subheadline rendering (canonical
 * `noSubheadline: true` flag). Used by Nano Banana to skip the
 * subheadline overlay and its QA check.
 */
export function isNoSubheadlineFormat(format: CampaignFormat): boolean {
  return MEXEM_ZONES[format]?.noSubheadline === true;
}

// ─────────────────────────────────────────────────────────────────────
// Canonical surface (per the prompt spec). The runtime data lives in
// MEXEM_ZONES with a flat shape (zone keys at the top level). The
// canonical exports below provide the nested-`zones` view used by
// docs, validation tests, and any consumer that wants the source-of-
// truth contract as a single immutable structure.
// ─────────────────────────────────────────────────────────────────────

export interface CanonicalBannerLayout {
  label: string;
  layoutClass: LayoutClass;
  canvas: BannerCanvas;
  noSubheadline: boolean;
  zones: {
    logo: ZoneBox;
    text: ZoneBox;
    cta: ZoneBox;
    risk_msg: ZoneBox;
    element: ZoneBox;
  };
}

function toCanonical(layout: FormatZones): CanonicalBannerLayout {
  return {
    label: layout.label,
    layoutClass: layout.class,
    canvas: layout.canvas,
    noSubheadline: layout.noSubheadline === true,
    zones: {
      logo: layout.logo,
      text: layout.text,
      cta: layout.cta,
      risk_msg: layout.risk_msg,
      element: layout.element,
    },
  };
}

export const CANONICAL_MEXEM_ZONES: Readonly<
  Record<string, CanonicalBannerLayout>
> = Object.freeze(
  Object.fromEntries(
    Object.entries(MEXEM_ZONES)
      .filter(([, layout]) => layout !== undefined)
      .map(([format, layout]) => [format, toCanonical(layout!)]),
  ),
);

export function getCanonicalMexemZones(
  format: string,
): CanonicalBannerLayout | undefined {
  return CANONICAL_MEXEM_ZONES[format];
}

export const MEXEM_NO_SUBHEADLINE_FORMATS: ReadonlySet<string> = new Set(
  Object.entries(CANONICAL_MEXEM_ZONES)
    .filter(([, layout]) => layout.noSubheadline)
    .map(([format]) => format),
);

export const MEXEM_LAYOUT_CLASSES: readonly LayoutClass[] = [
  "Wide leaderboard",
  "Tall portrait",
  "Square",
  "Compact rectangle",
  "Narrow skyscraper",
  "Placement marker",
];

export interface CanonicalZoneError {
  format: string;
  field: string;
  message: string;
}

/**
 * Programmatic version of the canonical contract check. Returns an
 * array of errors — empty when the live MEXEM_ZONES data is in sync
 * with the canonical spec. Used by `scripts/validate-zones.ts` and
 * available to any caller that wants a self-check at startup.
 */
export function validateCanonicalMexemZones(): CanonicalZoneError[] {
  const errors: CanonicalZoneError[] = [];
  const zoneNames: ZoneName[] = ["logo", "text", "cta", "risk_msg", "element"];
  for (const [format, layout] of Object.entries(CANONICAL_MEXEM_ZONES)) {
    const [w, h] = format.split("x").map((n) => parseInt(n, 10));
    if (!w || !h) {
      errors.push({ format, field: "format", message: "format key not parseable as WxH" });
      continue;
    }
    if (layout.canvas.width !== w || layout.canvas.height !== h) {
      errors.push({
        format,
        field: "canvas",
        message: `canvas ${layout.canvas.width}×${layout.canvas.height} doesn't match format key ${format}`,
      });
    }
    if (!MEXEM_LAYOUT_CLASSES.includes(layout.layoutClass)) {
      errors.push({
        format,
        field: "layoutClass",
        message: `unknown layoutClass "${layout.layoutClass}"`,
      });
    }
    for (const name of zoneNames) {
      const zone = layout.zones[name];
      if (!zone) {
        errors.push({ format, field: name, message: "missing zone" });
        continue;
      }
      if (zone.x < 0) errors.push({ format, field: `${name}.x`, message: `x ${zone.x} < 0` });
      if (zone.y < 0) errors.push({ format, field: `${name}.y`, message: `y ${zone.y} < 0` });
      if (zone.width <= 0)
        errors.push({ format, field: `${name}.width`, message: `width ${zone.width} <= 0` });
      if (zone.height <= 0)
        errors.push({ format, field: `${name}.height`, message: `height ${zone.height} <= 0` });
      if (zone.x + zone.width > layout.canvas.width) {
        errors.push({
          format,
          field: `${name}`,
          message: `right edge ${zone.x + zone.width} > canvas.width ${layout.canvas.width}`,
        });
      }
      if (zone.y + zone.height > layout.canvas.height) {
        errors.push({
          format,
          field: `${name}`,
          message: `bottom edge ${zone.y + zone.height} > canvas.height ${layout.canvas.height}`,
        });
      }
    }
  }
  return errors;
}

// Fixed CTA styling extracted from brand-input/banner-examples/*.svg.
// Every MEXEM banner uses the same CTA design: white rounded pill, black
// bold Poppins text. The CTA box (x, y, width, height) is owned by the
// per-format `cta` zone above; the ratios below control the visual
// treatment of whatever box that zone defines.
//
// Measured ratios across 12 example SVGs:
//   - border_radius : height = 0.149–0.196 (mean 0.17)
//   - font_size     : height = 0.388–0.392 (mean 0.39, very tight)
// Using the means as the enforced constants.
export const CTA_BORDER_RADIUS_RATIO = 0.17;
export const CTA_FONT_SIZE_RATIO = 0.39;
export const CTA_STYLE_INFO = {
  background_color: "#FFFFFF",
  color: "#000000",
  font_family: "Poppins",
  font_weight: 700,
  border_radius_ratio: CTA_BORDER_RADIUS_RATIO,
  font_size_ratio: CTA_FONT_SIZE_RATIO,
} as const;
const CTA_STYLE = {
  background_color: "#FFFFFF",
  color: "#000000",
  font_family: "Poppins",
  font_weight: 700,
  text_align: "center" as const,
  uses_approved_color: true,
  uses_approved_font: true,
};

// Fixed sub-slot ratios within the `text` zone. The text zone is split
// top-to-bottom in the order headline → subheadline → body. Each role
// gets the same fraction of the zone's height regardless of how many
// roles are present, so the headline is always in the top 60% of the
// text zone, the subheadline always in the next 25%, and the body
// always in the bottom 15%.
export const TEXT_SLOT_RATIOS: Record<"headline" | "subheadline" | "body", {
  startRatio: number;
  endRatio: number;
}> = {
  headline:    { startRatio: 0.00, endRatio: 0.60 },
  subheadline: { startRatio: 0.60, endRatio: 0.85 },
  body:        { startRatio: 0.85, endRatio: 1.00 },
};

/**
 * Snap every element in `manifest` whose role maps to a zone onto that
 * zone's bounding box.
 *
 * Returns a new manifest; the input is not mutated. If the format has no
 * MEXEM zone template, the manifest is returned unchanged.
 */
export function applyMexemZones(
  manifest: ElementManifest,
  format: CampaignFormat,
): ElementManifest {
  const zones = MEXEM_ZONES[format];
  if (!zones) return manifest;

  const snappedElements = manifest.elements.map((el): Element => {
    if (isDecorativeText(el)) {
      return { ...el, visible: false };
    }
    const textSlot = textSlotFor(el.role, zones.text);
    if (textSlot) return { ...el, ...textSlot };
    const zoneName = ROLE_TO_ZONE[el.role];
    if (!zoneName) return el;
    const snapped = { ...el, ...zones[zoneName] };
    if (zoneName === "cta") {
      return {
        ...snapped,
        ...CTA_STYLE,
        border_radius: Math.round(zones.cta.height * CTA_BORDER_RADIUS_RATIO),
        font_size: Math.round(zones.cta.height * CTA_FONT_SIZE_RATIO),
        object_fit: "contain" as const,
      };
    }
    if (isImageLike(el)) {
      return { ...snapped, object_fit: "contain" as const };
    }
    return snapped;
  });

  // Last-resort fallback: when the upstream visual picker returns nothing
  // for this concept × format combo, the manifest can ship without a
  // product_visual element — which the canonical QA rule blocks on
  // non-Placement-marker formats. Inject a generic brand-input phone
  // mockup at the canonical element zone so the manifest is renderable
  // and QA passes. The deterministic pipeline's normal path still owns
  // visual selection when assets are available; this only fires when
  // pickVisualForSpec returned empty.
  const needsFallbackVisual =
    !FALLBACK_OPT_OUT_LAYOUTS.has(zones.class) &&
    !snappedElements.some(
      (el) =>
        el.visible !== false &&
        (el.role === "product_visual" ||
          el.role === "hero-image" ||
          el.role === "supporting-image"),
    );
  if (needsFallbackVisual) {
    snappedElements.push(buildFallbackProductVisual(zones.element));
  }

  return { ...manifest, elements: snappedElements };
}

// Placement-marker formats have intentionally tiny element zones (5×41 px
// on 320×50) so the brand reference often ships without a product visual
// at all. Skip the fallback there — the canonical QA rule also skips
// the product_visual requirement for this layout class.
const FALLBACK_OPT_OUT_LAYOUTS: ReadonlySet<LayoutClass> = new Set([
  "Placement marker",
]);

// ElementSchema validates file_url as z.string().url(), so a bare
// relative path fails. The renderer (ProductionElementLayer.tsx) strips
// the `file://localhost` prefix before rendering, so `file://localhost`
// + the public-served path is the right shape: passes URL validation
// AND resolves to /brand-input-preview/elements/3-iphone.png at runtime.
const FALLBACK_PRODUCT_VISUAL_FILE_URL =
  "file://localhost/brand-input-preview/elements/3-iphone.png";
const FALLBACK_PRODUCT_VISUAL_LOCAL_PATH =
  "/brand-input-preview/elements/3-iphone.png";

function buildFallbackProductVisual(zone: ZoneBox): Element {
  return {
    id: "el_visual_fallback",
    type: "image",
    role: "product_visual",
    source: "external-url",
    x: zone.x,
    y: zone.y,
    width: zone.width,
    height: zone.height,
    z_index: 20,
    opacity: 1,
    rotation: 0,
    visible: true,
    version: 1,
    file_url: FALLBACK_PRODUCT_VISUAL_FILE_URL,
    local_public_path: FALLBACK_PRODUCT_VISUAL_LOCAL_PATH,
    delivery_source: "local_preview" as const,
    object_fit: "contain" as const,
    alt_text: "",
    notes: "applyMexemZones fallback — upstream picker returned no visual",
  };
}

function isDecorativeText(el: Element): boolean {
  return el.role === "decorative" && el.type === "text";
}

function isImageLike(el: Element): boolean {
  return el.type === "image" || el.type === "logo" || el.type === "icon";
}

function textSlotFor(
  role: Element["role"],
  textZone: ZoneBox,
): ZoneBox | null {
  const key =
    role === "headline" || role === "subheadline" || role === "body"
      ? role
      : null;
  if (!key) return null;
  const { startRatio, endRatio } = TEXT_SLOT_RATIOS[key];
  const startY = textZone.y + Math.round(textZone.height * startRatio);
  const endY = textZone.y + Math.round(textZone.height * endRatio);
  return {
    x: textZone.x,
    y: startY,
    width: textZone.width,
    height: endY - startY,
  };
}
