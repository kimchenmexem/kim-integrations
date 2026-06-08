/**
 * Deterministic QA — cheap, manifest-only checks that run synchronously
 * without external calls. Complements Vision QA (which catches *visible*
 * brand violations) by catching *structural* manifest defects: missing
 * required elements, off-canvas geometry, zero-area text, and obvious
 * disclaimer overlaps.
 *
 * Severity vocabulary mirrors Vision QA (`info | warn | block`) so the
 * export gate can merge both reports without translation.
 *
 * Intentionally NOT covered here:
 *   - color contrast (needs rendered pixels)
 *   - typography legibility (renderer-specific)
 *   - logo dominance / safe-area inset (brand-rule territory, lives in
 *     BANNER_REFERENCE_RULES.md and is checked by Vision QA)
 *
 * Adding new checks: every check must be a pure function of the manifest
 * + brief — no fs, no fetch, no clock.
 */

import { z } from "zod";
import type { CampaignPlan } from "@/lib/schemas/aiCampaignPlan.schema";
import type {
  Element,
  ElementManifest,
} from "@/lib/schemas/elementManifest.schema";
import {
  CANONICAL_MEXEM_ZONES,
  type CanonicalBannerLayout,
} from "@/lib/formats/mexemZones";

export const DeterministicSeveritySchema = z.enum(["info", "warn", "block"]);
export type DeterministicSeverity = z.infer<typeof DeterministicSeveritySchema>;

export const DeterministicViolationSchema = z.object({
  check_id: z.string().min(1),
  severity: DeterministicSeveritySchema,
  description: z.string().min(1),
  element_id: z.string().optional(),
});
export type DeterministicViolation = z.infer<typeof DeterministicViolationSchema>;

export const DeterministicBannerReportSchema = z.object({
  ad_id: z.string(),
  concept_id: z.string(),
  format: z.string(),
  violations: z.array(DeterministicViolationSchema),
});
export type DeterministicBannerReport = z.infer<
  typeof DeterministicBannerReportSchema
>;

export const DeterministicCampaignReportSchema = z.object({
  campaign_id: z.string(),
  generated_at: z.string(),
  total: z.number().int().nonnegative(),
  with_violations: z.number().int().nonnegative(),
  counts: z.object({
    info: z.number().int().nonnegative(),
    warn: z.number().int().nonnegative(),
    block: z.number().int().nonnegative(),
  }),
  banners: z.array(DeterministicBannerReportSchema),
});
export type DeterministicCampaignReport = z.infer<
  typeof DeterministicCampaignReportSchema
>;

// Rounding tolerance for "inside canvas" checks. Layout helpers can land an
// element 0.5–1 px past the edge after font-metric rounding; that isn't a
// real defect.
const BOUNDS_TOLERANCE_PX = 1;
const TEXT_OVERLAP_AREA_RATIO_THRESHOLD = 0.18;

const EXPECTED_FORMAT_SIZES: Record<string, { width: number; height: number }> = {
  "1200x628": { width: 1200, height: 628 },
  "1080x1080": { width: 1080, height: 1080 },
  "1080x1920": { width: 1080, height: 1920 },
  "1200x1200": { width: 1200, height: 1200 },
  "300x250": { width: 300, height: 250 },
  "336x280": { width: 336, height: 280 },
  "960x1200": { width: 960, height: 1200 },
  "320x100": { width: 320, height: 100 },
  "320x50": { width: 320, height: 50 },
  "300x1050": { width: 300, height: 1050 },
  "300x600": { width: 300, height: 600 },
  "160x600": { width: 160, height: 600 },
  "970x250": { width: 970, height: 250 },
  "728x90": { width: 728, height: 90 },
  "250x250": { width: 250, height: 250 },
};

export function runDeterministicQa(plan: CampaignPlan): DeterministicCampaignReport {
  const riskRequired = plan.source_brief.risk_warning_required !== false;
  const banners: DeterministicBannerReport[] = [];
  for (const concept of plan.concepts) {
    for (const ad of concept.ad_specs) {
      banners.push({
        ad_id: ad.ad_id,
        concept_id: concept.concept_id,
        format: ad.format,
        violations: runChecksForBanner(ad.manifest, { riskRequired, format: ad.format }),
      });
    }
  }

  const counts = { info: 0, warn: 0, block: 0 };
  let withViolations = 0;
  for (const b of banners) {
    if (b.violations.length > 0) withViolations += 1;
    for (const v of b.violations) counts[v.severity] += 1;
  }

  return DeterministicCampaignReportSchema.parse({
    campaign_id: plan.campaign_id,
    generated_at: new Date().toISOString(),
    total: banners.length,
    with_violations: withViolations,
    counts,
    banners,
  });
}

export function hasBlockingViolations(
  report: DeterministicCampaignReport,
): boolean {
  return report.counts.block > 0;
}

interface CheckContext {
  riskRequired: boolean;
  format: string;
}

function runChecksForBanner(
  manifest: ElementManifest,
  ctx: CheckContext,
): DeterministicViolation[] {
  const violations: DeterministicViolation[] = [];
  const visible = manifest.elements.filter((e) => e.visible !== false);

  const headline = findByRole(visible, "headline");
  const cta = findByRole(visible, "cta");
  const logo = findByRole(visible, "logo");
  const disclaimer = findByRole(visible, "legal-disclaimer");

  const expectedSize = EXPECTED_FORMAT_SIZES[ctx.format];
  if (
    !expectedSize ||
    manifest.size.width !== expectedSize.width ||
    manifest.size.height !== expectedSize.height
  ) {
    violations.push({
      check_id: "format-size-mismatch",
      severity: "block",
      description: `Manifest size ${manifest.size.width}×${manifest.size.height} does not match format ${ctx.format} (${expectedSize ? `${expectedSize.width}×${expectedSize.height}` : "unsupported"}).`,
    });
  }

  // Required elements ─────────────────────────────────────────────────────
  if (!headline || !hasText(headline)) {
    violations.push({
      check_id: "headline-missing",
      severity: "block",
      description: "No headline element with non-empty text on the manifest.",
    });
  }
  if (!cta || !hasText(cta)) {
    violations.push({
      check_id: "cta-missing",
      severity: "block",
      description: "No CTA element with non-empty text on the manifest.",
    });
  }
  if (!logo) {
    violations.push({
      check_id: "logo-missing",
      severity: "block",
      description: "No logo element on the manifest.",
    });
  }
  if (ctx.riskRequired && (!disclaimer || !hasText(disclaimer))) {
    violations.push({
      check_id: "disclaimer-missing",
      severity: "block",
      description:
        "Brief requires a risk warning but no legal-disclaimer element with text was found.",
    });
  }

  // Zero-area text ────────────────────────────────────────────────────────
  for (const el of visible) {
    if (el.type !== "text" && el.role !== "cta" && el.role !== "legal-disclaimer") continue;
    if (!hasText(el)) continue;
    if (requiresTranslatorCopy(el) && el.copy_source !== "marketing-translator") {
      violations.push({
        check_id: "text-not-from-marketing-translator",
        severity: "block",
        description: `Text element "${el.id}" (role: ${el.role}) is not marked as marketing-translator copy.`,
        element_id: el.id,
      });
    }
    if (el.width <= 0 || el.height <= 0) {
      violations.push({
        check_id: "text-zero-area",
        severity: "block",
        description: `Text element "${el.id}" has zero width or height (${el.width}×${el.height}).`,
        element_id: el.id,
      });
    }
  }

  // Canvas-bounds checks ──────────────────────────────────────────────────
  for (const el of visible) {
    if (!isTrackedForBounds(el)) continue;
    if (!isInsideCanvas(el, manifest)) {
      violations.push({
        check_id: roleBoundsCheckId(el.role),
        severity: "block",
        description: `Element "${el.id}" (role: ${el.role}) extends outside the ${manifest.size.width}×${manifest.size.height} canvas: x=${el.x}, y=${el.y}, w=${el.width}, h=${el.height}.`,
        element_id: el.id,
      });
    }
  }

  // Obvious overlap checks ────────────────────────────────────────────────
  // Disclaimer is the smallest text on the canvas and must remain legible
  // — overlap with CTA or headline always hurts legibility, so we surface
  // both as block-level. (Vision QA catches visual subtleties; this catches
  // the manifest-level slip-up.)
  if (disclaimer && cta && rectsOverlap(disclaimer, cta)) {
    violations.push({
      check_id: "disclaimer-overlaps-cta",
      severity: "block",
      description: `Disclaimer "${disclaimer.id}" overlaps CTA "${cta.id}".`,
      element_id: disclaimer.id,
    });
  }
  if (disclaimer && headline && rectsOverlap(disclaimer, headline)) {
    violations.push({
      check_id: "disclaimer-overlaps-headline",
      severity: "block",
      description: `Disclaimer "${disclaimer.id}" overlaps headline "${headline.id}".`,
      element_id: disclaimer.id,
    });
  }

  // CTA must sit either below or beside the text stack — never on top of
  // the subheadline / headline. When the AI's layout hint pushes the CTA
  // into the text stack and buildElements' clamps don't catch it, the rendered
  // banner has the CTA "stamped" over the copy. Surfaced in a real generation
  // where 7/21 banners had subheadline ↔ CTA overlap.
  const subheadline = findByRole(visible, "subheadline");
  if (cta && subheadline && rectsOverlap(cta, subheadline)) {
    violations.push({
      check_id: "cta-overlaps-subheadline",
      severity: "block",
      description: `CTA "${cta.id}" overlaps subheadline "${subheadline.id}".`,
      element_id: cta.id,
    });
  }
  if (cta && headline && rectsOverlap(cta, headline)) {
    violations.push({
      check_id: "cta-overlaps-headline",
      severity: "block",
      description: `CTA "${cta.id}" overlaps headline "${headline.id}".`,
      element_id: cta.id,
    });
  }

  const textElements = visible.filter((el) => requiresTranslatorCopy(el));
  for (let i = 0; i < textElements.length; i += 1) {
    for (let j = i + 1; j < textElements.length; j += 1) {
      const a = textElements[i];
      const b = textElements[j];
      if (!rectsOverlap(a, b)) continue;
      const smaller = Math.max(1, Math.min(a.width * a.height, b.width * b.height));
      const ratio = overlapArea(a, b) / smaller;
      if (ratio < TEXT_OVERLAP_AREA_RATIO_THRESHOLD) continue;
      violations.push({
        check_id: "text-overlap",
        severity: "block",
        description: `Text element "${a.id}" (role: ${a.role}) overlaps "${b.id}" (role: ${b.role}) by ${Math.round(ratio * 100)}% of the smaller box.`,
        element_id: a.id,
      });
    }
  }

  // MEXEM reference-style rules that are easy to enforce from the manifest.
  // These keep the production generator aligned with the approved reference
  // banners instead of relying on prompts and reviewer memory.
  if (headline && hasText(headline)) {
    const hasReferenceSplit = Boolean(
      headline.emphasis_text && headline.emphasis_color,
    );
    const hasAllowedSolidTreatment = headline.emphasis_style === "solid";
    if (!hasReferenceSplit && !hasAllowedSolidTreatment) {
      violations.push({
        check_id: "headline-missing-reference-split",
        severity: "block",
        description:
          "Headline is missing the reference two-color split or an explicit solid headline treatment.",
        element_id: headline.id,
      });
    }
  }
  // Note: the previous `leaderboard-cta-not-bottom-band` and
  // `leaderboard-cta-not-yellow` rules enforced a full-width yellow CTA band
  // for 1200×628. Both were removed once the actual brand-input example SVGs
  // (brand-input/banner-examples/*.svg) showed every MEXEM banner uses a
  // white pill CTA with black bold text. CTA styling is now enforced by
  // src/lib/formats/mexemZones.ts → CTA_STYLE, applied during the zone snap.
  // Disclaimer position vs CTA:
  //   - Full-width bottom-band CTA (e.g. 1200×628 yellow strip) → disclaimer
  //     MUST sit above (block when below).
  //   - Centered / inline CTA pill → disclaimer goes BELOW (no constraint
  //     here; the layout owns that placement).
  if (disclaimer && cta && disclaimer.y > cta.y) {
    const isCtaBottomBand =
      cta.x === 0 && cta.width >= manifest.size.width - 1;
    if (isCtaBottomBand) {
      violations.push({
        check_id: "disclaimer-below-cta",
        severity: "block",
        description:
          "Reference layout requires the disclaimer above a full-width bottom-band CTA, between the copy stack and the call to action.",
        element_id: disclaimer.id,
      });
    }
  }
  for (const el of visible) {
    if (el.id.startsWith("el_motif_") || el.id === "el_brand_pattern") {
      violations.push({
        check_id: "reference-decorative-motif",
        severity: "block",
        description:
          `Reference layout forbids generated motif/pattern layer "${el.id}".`,
        element_id: el.id,
      });
    }
    const usesIbkrRed =
      normalizeHex(el.color) === "#D81222" ||
      normalizeHex(el.background_color) === "#D81222" ||
      normalizeHex(el.border_color) === "#D81222";
    const isIbkrLockup =
      el.role === "logo" ||
      el.id.toLowerCase().includes("ibkr") ||
      el.id.toLowerCase().includes("powered");
    if (usesIbkrRed && !isIbkrLockup) {
      violations.push({
        check_id: "ibkr-red-outside-lockup",
        severity: "block",
        description:
          `IBKR red #D81222 is reserved for the partnership lockup, but "${el.id}" uses it.`,
        element_id: el.id,
      });
    }
  }

  // Product visual must occupy its own zone — when its box overlaps a text
  // role by ≥30% of the text element's area, the headline / subheadline /
  // CTA is effectively *buried* in the visual (z-index above doesn't help
  // legibility — the image still bleeds under the text and contrast tanks).
  // The 30% threshold lets minor edge-touches through (a few pixels of
  // overlap from font-metric rounding is fine); a real layout collision is
  // always well above that.
  const productVisual = findByRole(visible, "product_visual");
  if (productVisual) {
    for (const role of ["headline", "subheadline", "body", "cta"] as const) {
      const text = findByRole(visible, role);
      if (!text) continue;
      if (!rectsOverlap(productVisual, text)) continue;
      const tArea = Math.max(1, text.width * text.height);
      const ovArea = overlapArea(productVisual, text);
      if (ovArea / tArea < 0.3) continue;
      violations.push({
        check_id: `product-visual-overlaps-${role}`,
        severity: "block",
        description: `Product visual "${productVisual.id}" covers ${Math.round((ovArea / tArea) * 100)}% of ${role} "${text.id}" — text will be buried by the image.`,
        element_id: text.id,
      });
    }
  }

  // ── Canonical-zone compliance ─────────────────────────────────────
  // Defense-in-depth: applyMexemZones() snaps elements to the canonical
  // safe zones at manifest-build time. These checks catch the case
  // where the snap was skipped (non-MEXEM brand, unknown format) or
  // where downstream code mutated geometry after the snap.
  const formatKey = `${manifest.size.width}x${manifest.size.height}`;
  const canonical = CANONICAL_MEXEM_ZONES[formatKey];
  if (canonical) {
    pushCanonicalZoneViolations(violations, manifest, canonical, visible);
  }

  return violations;
}

// Tolerance for "element is inside its canonical zone" checks. Renderers
// commonly snap to subpixel positions; allow ±1 px before flagging.
const CANONICAL_ZONE_TOLERANCE_PX = 1;

const CANONICAL_ROLE_TO_ZONE: ReadonlyArray<{
  role: Element["role"];
  zoneName: "logo" | "text" | "cta" | "risk_msg" | "element";
  checkId: string;
}> = [
  { role: "logo", zoneName: "logo", checkId: "canonical-logo-out-of-zone" },
  { role: "headline", zoneName: "text", checkId: "canonical-headline-out-of-zone" },
  { role: "subheadline", zoneName: "text", checkId: "canonical-subheadline-out-of-zone" },
  { role: "cta", zoneName: "cta", checkId: "canonical-cta-out-of-zone" },
  { role: "legal-disclaimer", zoneName: "risk_msg", checkId: "canonical-disclaimer-out-of-zone" },
  { role: "product_visual", zoneName: "element", checkId: "canonical-product-visual-out-of-zone" },
];

function pushCanonicalZoneViolations(
  violations: DeterministicViolation[],
  manifest: ElementManifest,
  canonical: CanonicalBannerLayout,
  visible: Element[],
): void {
  // 1. Canvas dimensions must match the canonical canvas.
  if (
    manifest.size.width !== canonical.canvas.width ||
    manifest.size.height !== canonical.canvas.height
  ) {
    violations.push({
      check_id: "canonical-canvas-mismatch",
      severity: "block",
      description: `Manifest canvas ${manifest.size.width}×${manifest.size.height} doesn't match canonical canvas ${canonical.canvas.width}×${canonical.canvas.height} for format key.`,
    });
  }

  // 2. Required roles.
  //   - logo, headline, cta, legal-disclaimer — required on every banner.
  //   - product_visual — required on every NON-Placement-marker format.
  //     Placement markers (728×90, 320×100, 320×50) have intentionally
  //     tiny element zones — 320×50's is a 5×41 sliver — so the brand
  //     reference for those formats often ships without a product
  //     visual at all. Requiring it there would block legitimate
  //     micro-banner saves.
  //   - subheadline — always optional; forbidden on Placement markers
  //     (see check #3).
  const requiredRoles: Element["role"][] = [
    "logo",
    "headline",
    "cta",
    "legal-disclaimer",
  ];
  if (canonical.layoutClass !== "Placement marker") {
    requiredRoles.push("product_visual");
  }
  for (const role of requiredRoles) {
    if (!visible.some((el) => el.role === role)) {
      violations.push({
        check_id: "canonical-missing-required-role",
        severity: "block",
        description: `Canonical layout for ${canonical.canvas.width}×${canonical.canvas.height} requires a visible "${role}" element; none found.`,
      });
    }
  }

  // 3. noSubheadline rule: placement-marker formats must NOT render a
  // visible subheadline element.
  if (canonical.noSubheadline) {
    const subheadline = visible.find((el) => el.role === "subheadline");
    if (subheadline) {
      violations.push({
        check_id: "canonical-subheadline-on-placement-marker",
        severity: "block",
        description: `Format ${canonical.canvas.width}×${canonical.canvas.height} is a Placement marker (noSubheadline=true) but a subheadline element "${subheadline.id}" is visible.`,
        element_id: subheadline.id,
      });
    }
  }

  // 4. Off-canvas check — every visible element must fit inside the
  // canvas with ±1 px tolerance for subpixel rendering.
  for (const el of visible) {
    if (
      el.x < -CANONICAL_ZONE_TOLERANCE_PX ||
      el.y < -CANONICAL_ZONE_TOLERANCE_PX ||
      el.x + el.width > canonical.canvas.width + CANONICAL_ZONE_TOLERANCE_PX ||
      el.y + el.height > canonical.canvas.height + CANONICAL_ZONE_TOLERANCE_PX
    ) {
      violations.push({
        check_id: "canonical-off-canvas",
        severity: "block",
        description: `Element "${el.id}" (role: ${el.role}) at (${el.x},${el.y},${el.width},${el.height}) extends outside canonical canvas ${canonical.canvas.width}×${canonical.canvas.height}.`,
        element_id: el.id,
      });
    }
  }

  // 5. Per-role canonical-zone containment — each role-mapped element
  // must lie inside its canonical zone (with the small tolerance).
  for (const { role, zoneName, checkId } of CANONICAL_ROLE_TO_ZONE) {
    const el = visible.find((e) => e.role === role);
    if (!el) continue;
    const zone = canonical.zones[zoneName];
    const t = CANONICAL_ZONE_TOLERANCE_PX;
    const insideZone =
      el.x >= zone.x - t &&
      el.y >= zone.y - t &&
      el.x + el.width <= zone.x + zone.width + t &&
      el.y + el.height <= zone.y + zone.height + t;
    if (!insideZone) {
      violations.push({
        check_id: checkId,
        severity: "block",
        description: `Element "${el.id}" (role: ${role}) at (${el.x},${el.y},${el.width},${el.height}) is outside canonical ${zoneName} zone (${zone.x},${zone.y},${zone.width},${zone.height}).`,
        element_id: el.id,
      });
    }
  }
}

function findByRole(elements: Element[], role: Element["role"]): Element | undefined {
  return elements.find((e) => e.role === role);
}

function hasText(el: Element): boolean {
  return typeof el.text === "string" && el.text.trim().length > 0;
}

function requiresTranslatorCopy(el: Element): boolean {
  if (!hasText(el)) return false;
  if (el.role === "logo") return false;
  if (
    el.role === "headline" ||
    el.role === "subheadline" ||
    el.role === "body" ||
    el.role === "cta" ||
    el.role === "legal-disclaimer"
  ) {
    return true;
  }
  return el.type === "text";
}

function isTrackedForBounds(el: Element): boolean {
  if (el.role === "legal-disclaimer") return true;
  if (el.role === "product_visual") return true;
  if (el.type === "text") return true;
  if (el.role === "headline" || el.role === "subheadline" || el.role === "body" || el.role === "cta") return true;
  return false;
}

function roleBoundsCheckId(role: Element["role"]): string {
  if (role === "legal-disclaimer") return "disclaimer-off-canvas";
  if (role === "product_visual") return "product-visual-off-canvas";
  return "text-off-canvas";
}

function isInsideCanvas(el: Element, manifest: ElementManifest): boolean {
  const t = BOUNDS_TOLERANCE_PX;
  return (
    el.x >= -t &&
    el.y >= -t &&
    el.x + el.width <= manifest.size.width + t &&
    el.y + el.height <= manifest.size.height + t
  );
}

function rectsOverlap(a: Element, b: Element): boolean {
  if (a.width <= 0 || a.height <= 0 || b.width <= 0 || b.height <= 0) return false;
  return (
    a.x < b.x + b.width &&
    b.x < a.x + a.width &&
    a.y < b.y + b.height &&
    b.y < a.y + a.height
  );
}

function overlapArea(a: Element, b: Element): number {
  const dx = Math.max(0, Math.min(a.x + a.width, b.x + b.width) - Math.max(a.x, b.x));
  const dy = Math.max(0, Math.min(a.y + a.height, b.y + b.height) - Math.max(a.y, b.y));
  return dx * dy;
}

function normalizeHex(value: string | undefined): string | null {
  if (!value) return null;
  const v = value.trim().toUpperCase();
  if (/^#[0-9A-F]{6}$/.test(v)) return v;
  if (/^#[0-9A-F]{3}$/.test(v)) {
    return `#${v[1]}${v[1]}${v[2]}${v[2]}${v[3]}${v[3]}`;
  }
  return null;
}
