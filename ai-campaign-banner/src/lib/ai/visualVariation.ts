import {
  VisualLayoutSpecSchema,
  VISUAL_LAYOUT_SPEC_VERSION,
  type VisualLayoutSpec,
  type LayoutType,
} from "@/lib/schemas/visualLayoutSpec.schema";
import type { MidjourneyContext } from "@/lib/schemas/midjourney.schema";
import { z } from "zod";

// ─────────────────────────────────────────────────────────────────────────────
// Controlled visual-diversity layer.
//
// WHY THIS EXISTS (root cause of "every campaign looks identical"):
//   The whole visual pipeline is driven by ONE VisualLayoutSpec per concept.
//   The mapping layer (mapVisualSpecToInternals.ts) always prefers the spec
//   over the campaign-seeded PRNG. In the default mock provider that spec is a
//   FIXED set of 3 specs, so concept N always renders the same template /
//   composition / motif / accent / background — only the copy changes.
//
// WHAT THIS DOES:
//   Produces a deterministic, campaign-seeded, cross-concept-distinct,
//   AI-intent-biased VisualVariationPlan per concept, and overlays it onto the
//   (constant / weak) spec to produce an EFFECTIVE spec that varies per
//   campaign. The effective spec then flows through the UNCHANGED mapping /
//   positioning pipeline — so element positions, safe zones, brand colors,
//   fonts, and legal copy are all untouched.
//
// INVARIANTS (do not break):
//   - AI never chooses x/y/width/height. This layer only picks among closed
//     enums; the renderer maps enums → safe deterministic layouts.
//   - Render determinism: the plan is a PURE function of the persisted
//     campaign_id (+ optional diversity_seed) + VISUAL_VARIATION_VERSION. The
//     effective spec is persisted on the concept, so re-rendering a saved
//     campaign is byte-identical.
//   - Generation diversity: a NEW campaign gets a new campaign_id → a new
//     seed → different (but still on-brand, still zone-safe) visual choices.
//   - Brand Kit stays the authority for colors/fonts/legal — this only chooses
//     AMONG brand-approved options (which gradient angle, which palette index,
//     which accent treatment, …), never raw colors.
// ─────────────────────────────────────────────────────────────────────────────

/** Bump when the variation logic changes in a way that should re-shuffle
 * choices for NEW campaigns. Persisted campaigns are unaffected (they carry
 * their own baked effective spec). */
export const VISUAL_VARIATION_VERSION = "1.0.0" as const;

// Only the three families that have real, zone-safe builders. split_panel /
// data_focus / photo_immersive are intentionally excluded — the renderer
// collapses them anyway, and we want every generated design to land on a
// builder that respects the safe zones.
export type TemplateFamily = "mockup_hero" | "pattern_immersive" | "editorial_type";
const TEMPLATE_FAMILIES: TemplateFamily[] = [
  "mockup_hero",
  "pattern_immersive",
  "editorial_type",
];

type BackgroundStyle = "solid" | "gradient" | "deep_gradient" | "split_color";
type PaletteIntensity = "calm" | "standard" | "high_contrast";
type AccentUsage = "none" | "subtle" | "cta_only" | "strong";
type Emphasis = "quiet" | "balanced" | "bold";
type CtaWeight = "ghost" | "standard" | "loud";
type CtaWidth = "fit_text" | "fixed" | "full_text_block";
type Density = "minimal" | "balanced" | "rich";
type Padding = "tight" | "standard" | "airy";
type MotifHint =
  | "chart_silhouette"
  | "abstract_bars"
  | "axis_grid"
  | "wave_curve"
  | "gradient_orb"
  | "node_network"
  | "arc_meter"
  | "ticker_strip"
  | "none";
type PatternHint =
  | "diagonal_lines"
  | "diagonal_lines_reverse"
  | "vertical_bars"
  | "dot_grid"
  | "concentric_arcs";

// ── AI visual intent (soft bias only) ────────────────────────────────────────
//
// The AI may express a HIGH-LEVEL mood/preference. It is validated and used
// ONLY to bias the deterministic allocator — it never pins coordinates, colors,
// or legal copy, and an unsupported value is ignored (safe fallback).
export const VisualIntentSchema = z
  .object({
    energy: z.enum(["calm", "confident", "dynamic", "premium"]).optional(),
    preferredTemplate: z
      .enum(["mockup_hero", "pattern_immersive", "editorial_type"])
      .optional(),
    motifHint: z.enum(["data", "geometric", "market", "premium", "minimal"]).optional(),
    imageMood: z.enum(["professional", "platform", "abstract", "educational"]).optional(),
  })
  .strip();
export type VisualIntent = z.infer<typeof VisualIntentSchema>;

/** Parse/sanitize arbitrary AI output into a safe VisualIntent (or undefined). */
export function sanitizeVisualIntent(raw: unknown): VisualIntent | undefined {
  if (raw == null) return undefined;
  const parsed = VisualIntentSchema.safeParse(raw);
  if (!parsed.success) return undefined;
  // Drop an all-empty object so downstream treats it as "no signal".
  return Object.values(parsed.data).some((v) => v !== undefined) ? parsed.data : undefined;
}

// ── The variation plan (persisted for observability + determinism proof) ─────
export interface VisualVariationPlan {
  version: typeof VISUAL_VARIATION_VERSION;
  templateFamily: TemplateFamily;
  emphasis: Emphasis;
  background: {
    style: BackgroundStyle;
    intensity: PaletteIntensity;
    gradientAngle: number;
    paletteIndex: number;
  };
  motif: MotifHint;
  pattern: PatternHint;
  accent: AccentUsage;
  logoProminence: "small" | "standard" | "prominent";
  cta: { weight: CtaWeight; width: CtaWidth };
  spacing: { density: Density; padding: Padding };
}

export const VisualVariationPlanSchema: z.ZodType<VisualVariationPlan> = z.object({
  version: z.literal(VISUAL_VARIATION_VERSION).default(VISUAL_VARIATION_VERSION),
  templateFamily: z.enum(["mockup_hero", "pattern_immersive", "editorial_type"]),
  emphasis: z.enum(["quiet", "balanced", "bold"]),
  background: z.object({
    style: z.enum(["solid", "gradient", "deep_gradient", "split_color"]),
    intensity: z.enum(["calm", "standard", "high_contrast"]),
    gradientAngle: z.number().int().min(0).max(359),
    paletteIndex: z.number().int().min(0),
  }),
  motif: z.enum([
    "chart_silhouette", "abstract_bars", "axis_grid", "wave_curve",
    "gradient_orb", "node_network", "arc_meter", "ticker_strip", "none",
  ]),
  pattern: z.enum([
    "diagonal_lines", "diagonal_lines_reverse", "vertical_bars", "dot_grid", "concentric_arcs",
  ]),
  accent: z.enum(["none", "subtle", "cta_only", "strong"]),
  logoProminence: z.enum(["small", "standard", "prominent"]),
  cta: z.object({
    weight: z.enum(["ghost", "standard", "loud"]),
    width: z.enum(["fit_text", "fixed", "full_text_block"]),
  }),
  spacing: z.object({
    density: z.enum(["minimal", "balanced", "rich"]),
    padding: z.enum(["tight", "standard", "airy"]),
  }),
}) as unknown as z.ZodType<VisualVariationPlan>;

// ── Deterministic PRNG (xorshift, string-seeded) ─────────────────────────────
function seededRng(seed: string): () => number {
  let h = 2166136261;
  for (let i = 0; i < seed.length; i++) {
    h ^= seed.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return () => {
    h ^= h << 13;
    h ^= h >>> 17;
    h ^= h << 5;
    h = h >>> 0;
    return h / 0xffffffff;
  };
}
function pick<T>(rng: () => number, arr: readonly T[]): T {
  return arr[Math.floor(rng() * arr.length)];
}

/** Campaign-level seed. Pure function of the persisted campaign_id so render
 * is deterministic; includes VISUAL_VARIATION_VERSION so a logic bump only
 * affects NEW campaigns. diversity_seed lets the same brief re-shuffle. */
export function deriveCampaignVisualSeed(
  campaign_id: string,
  diversity_seed?: string | number,
): string {
  const ds = diversity_seed === undefined ? "" : String(diversity_seed);
  return `${campaign_id}::${ds}::v${VISUAL_VARIATION_VERSION}`;
}

// Context → motif pool (mirrors buildAdSpecsFromPlan.pickMotifForContext so the
// motif still reads natural for the concept's subject).
const MOTIF_POOLS: Record<string, MotifHint[]> = {
  charts: ["chart_silhouette", "wave_curve", "axis_grid", "ticker_strip", "none"],
  stocks: ["chart_silhouette", "abstract_bars", "ticker_strip", "arc_meter", "none"],
  etfs: ["abstract_bars", "node_network", "gradient_orb", "axis_grid", "none"],
  green_data: ["wave_curve", "node_network", "gradient_orb", "none"],
  general_platform: ["gradient_orb", "axis_grid", "wave_curve", "node_network", "none"],
  premium_fintech: ["gradient_orb", "wave_curve", "arc_meter", "none"],
};
const BACKGROUND_STYLES: BackgroundStyle[] = ["gradient", "deep_gradient", "split_color", "solid"];
const PATTERNS: PatternHint[] = [
  "diagonal_lines", "diagonal_lines_reverse", "vertical_bars", "dot_grid", "concentric_arcs",
];
const GRADIENT_ANGLES = [135, 45, 200, 90, 110, 160, 25, 305];

// AI intent bias maps ──────────────────────────────────────────────────────
const ENERGY_TO_EMPHASIS: Record<NonNullable<VisualIntent["energy"]>, Emphasis> = {
  calm: "quiet",
  confident: "balanced",
  dynamic: "bold",
  premium: "quiet",
};
const MOTIF_HINT_TO_FAMILY: Record<string, MotifHint[]> = {
  data: ["axis_grid", "ticker_strip", "node_network"],
  geometric: ["abstract_bars", "concentric_arcs" as MotifHint, "gradient_orb"],
  market: ["chart_silhouette", "ticker_strip", "arc_meter"],
  premium: ["gradient_orb", "wave_curve"],
  minimal: ["none"],
};

interface ConceptSeedInput {
  conceptId: string;
  context: MidjourneyContext;
  intent?: VisualIntent;
}

/**
 * Allocate one VisualVariationPlan per concept, deterministically from the
 * campaign seed, biased by AI intent, with cross-concept distinctness:
 *   - distinct template families where possible (3 families → one each for the
 *     standard 3-concept campaign, permuted by the campaign seed)
 *   - "at most one concept may use accent_usage=strong" (brand rule)
 *   - distinct background styles across concepts where possible
 */
export function allocateVisualVariations(args: {
  campaignSeed: string;
  concepts: ConceptSeedInput[];
  enforceDistinct?: boolean;
}): VisualVariationPlan[] {
  const { campaignSeed, concepts } = args;
  const enforceDistinct = args.enforceDistinct !== false;
  const campaignRng = seededRng(`${campaignSeed}::families`);

  const families = allocateFamilies(campaignRng, concepts, enforceDistinct);

  const usedBackgrounds = new Set<BackgroundStyle>();
  let strongAccentUsed = false;

  return concepts.map((c, idx) => {
    const rng = seededRng(`${campaignSeed}::concept::${idx}::${c.conceptId}`);
    const family = families[idx];

    // Emphasis: bias by energy intent, else seeded.
    const emphasis: Emphasis =
      c.intent?.energy != null
        ? ENERGY_TO_EMPHASIS[c.intent.energy]
        : pick(rng, ["quiet", "balanced", "bold"] as Emphasis[]);

    // Background style — prefer an unused style across concepts for variety.
    let style = pick(rng, BACKGROUND_STYLES);
    if (enforceDistinct) {
      for (let a = 0; a < 6 && usedBackgrounds.has(style); a++) style = pick(rng, BACKGROUND_STYLES);
    }
    usedBackgrounds.add(style);
    const intensity = pick(rng, ["calm", "standard", "high_contrast"] as PaletteIntensity[]);
    const gradientAngle = pick(rng, GRADIENT_ANGLES);
    const paletteIndex = Math.floor(rng() * 8);

    // Motif: bias by AI motifHint, else the context pool.
    const motif = pickMotif(rng, c);

    const pattern = pick(rng, PATTERNS);

    // Accent — enforce "at most one strong" across concepts.
    let accent = pick(rng, ["none", "subtle", "cta_only", "strong"] as AccentUsage[]);
    if (accent === "strong") {
      if (strongAccentUsed) accent = "cta_only";
      else strongAccentUsed = true;
    }

    const logoProminence = pick(rng, ["small", "standard", "prominent"] as const);
    const cta = {
      weight: pick(rng, ["ghost", "standard", "loud"] as CtaWeight[]),
      width: pick(rng, ["fit_text", "fixed", "full_text_block"] as CtaWidth[]),
    };
    const spacing = {
      density: pick(rng, ["minimal", "balanced", "rich"] as Density[]),
      padding: pick(rng, ["tight", "standard", "airy"] as Padding[]),
    };

    return {
      version: VISUAL_VARIATION_VERSION,
      templateFamily: family,
      emphasis,
      background: { style, intensity, gradientAngle, paletteIndex },
      motif,
      pattern,
      accent,
      logoProminence,
      cta,
      spacing,
    };
  });
}

function allocateFamilies(
  rng: () => number,
  concepts: ConceptSeedInput[],
  enforceDistinct: boolean,
): TemplateFamily[] {
  // Seeded shuffle of the 3 families → distinct-per-concept for the standard
  // 3-concept campaign; cycles for >3.
  const shuffled = [...TEMPLATE_FAMILIES];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  const out: TemplateFamily[] = concepts.map((_, idx) => shuffled[idx % shuffled.length]);

  // Soft AI bias: if a concept named a preferredTemplate and it doesn't hurt
  // distinctness (its slot's family is free to swap), honor it.
  if (enforceDistinct) {
    concepts.forEach((c, idx) => {
      const pref = c.intent?.preferredTemplate as TemplateFamily | undefined;
      if (!pref || out[idx] === pref) return;
      const swapIdx = out.findIndex((f, k) => f === pref && k !== idx);
      if (swapIdx >= 0) {
        [out[idx], out[swapIdx]] = [out[swapIdx], out[idx]];
      }
    });
  }
  return out;
}

function pickMotif(rng: () => number, c: ConceptSeedInput): MotifHint {
  if (c.intent?.motifHint) {
    const pool = MOTIF_HINT_TO_FAMILY[c.intent.motifHint];
    if (pool && pool.length) return pick(rng, pool);
  }
  const pool = MOTIF_POOLS[c.context] ?? MOTIF_POOLS.general_platform;
  return pick(rng, pool);
}

// ── Overlay the variation onto a spec → effective spec ───────────────────────
//
// The variation WINS for the high-impact style dimensions (that's the whole
// point — they were previously frozen by the constant mock spec). Fine-layout
// fields (focus targets, text position/alignment, cta placement,
// format_adaptation, rationale) are kept from the AI base spec when present, so
// a real AI planner still influences composition detail. The result is
// validated against VisualLayoutSpecSchema so a mis-mapped enum fails fast.

const DEFAULT_BASE: VisualLayoutSpec = {
  spec_version: VISUAL_LAYOUT_SPEC_VERSION,
  layout_type: "mockup_hero",
  composition: "text_leading",
  hierarchy: { primary_focus: "headline", secondary_focus: "cta", emphasis_level: "balanced" },
  text_strategy: {
    headline_position: "left",
    headline_scale: "standard",
    text_alignment: "left",
    max_text_density: "medium",
  },
  visual_strategy: {
    primary_visual: "mockup",
    visual_position: "right",
    visual_weight: "balanced",
    use_mockup: true,
    use_screenshot: true,
    use_motif: false,
    use_pattern: false,
  },
  brand_strategy: {
    background_style: "gradient",
    palette_intensity: "standard",
    accent_usage: "cta_only",
    logo_prominence: "standard",
  },
  cta_strategy: { placement: "below_subheadline", weight: "standard", width: "fit_text" },
  spacing: { density: "balanced", padding: "standard", safe_area_priority: "normal" },
  format_adaptation: {},
  rationale: "Deterministic visual-variation base.",
};

// Composition compatible with each family (mirrors COMPOSITIONS_BY_TEMPLATE /
// the mapping's compatibility enforcement, so nothing gets collapsed).
function compositionForFamily(
  family: TemplateFamily,
  rng: () => number,
): VisualLayoutSpec["composition"] {
  if (family === "mockup_hero") return pick(rng, ["text_leading", "visual_leading"] as const);
  return "hero_overlay"; // pattern_immersive + editorial_type render full-canvas
}

export function buildEffectiveSpec(
  plan: VisualVariationPlan,
  base: VisualLayoutSpec | undefined,
  compositionRng: () => number,
): VisualLayoutSpec {
  const b = base ?? DEFAULT_BASE;
  const family = plan.templateFamily;
  const composition = compositionForFamily(family, compositionRng);

  const layoutType: LayoutType = family;

  // Coherent visual_strategy per family + motif/pattern from the plan.
  const motifOn = plan.motif !== "none";
  let visual_strategy: VisualLayoutSpec["visual_strategy"];
  if (family === "mockup_hero") {
    visual_strategy = {
      primary_visual: "mockup",
      visual_position: composition === "visual_leading" ? "left" : "right",
      visual_weight: "balanced",
      use_mockup: true,
      use_screenshot: true,
      use_motif: motifOn,
      use_pattern: false,
      motif_hint: plan.motif,
    };
  } else if (family === "pattern_immersive") {
    visual_strategy = {
      primary_visual: "pattern",
      visual_position: "background",
      visual_weight: "dominant",
      use_mockup: false,
      use_screenshot: false,
      use_motif: false,
      use_pattern: true,
      pattern_hint: plan.pattern,
    };
  } else {
    // editorial_type — typography-led; optional motif accent.
    visual_strategy = {
      primary_visual: motifOn ? "motif" : "abstract_gradient",
      visual_position: "background",
      visual_weight: motifOn ? "subtle" : "subtle",
      use_mockup: false,
      use_screenshot: false,
      use_motif: motifOn,
      use_pattern: false,
      motif_hint: plan.motif,
    };
  }

  const effective: VisualLayoutSpec = {
    ...b,
    spec_version: VISUAL_LAYOUT_SPEC_VERSION,
    layout_type: layoutType,
    composition,
    hierarchy: { ...b.hierarchy, emphasis_level: plan.emphasis },
    // Keep the base's text placement/focus (fine layout) but let density flow.
    text_strategy: { ...b.text_strategy },
    visual_strategy,
    brand_strategy: {
      background_style: plan.background.style,
      palette_intensity: plan.background.intensity,
      accent_usage: plan.accent,
      logo_prominence: plan.logoProminence,
      gradient_angle_hint: plan.background.gradientAngle,
      background_palette_index_hint: plan.background.paletteIndex,
    },
    cta_strategy: {
      ...b.cta_strategy,
      weight: plan.cta.weight,
      width: plan.cta.width,
    },
    spacing: {
      ...b.spacing,
      density: plan.spacing.density,
      padding: plan.spacing.padding,
    },
    // format_adaptation + rationale retained from base (fine layout / review).
  };

  // Fail fast if a mapping ever produces an invalid enum combination.
  return VisualLayoutSpecSchema.parse(effective);
}

/** A coarse distance between two plans over the perceptually-dominant dims.
 * Used by tests (and future reselection) to assert concepts differ. */
export function variationDistance(a: VisualVariationPlan, b: VisualVariationPlan): number {
  let d = 0;
  if (a.templateFamily !== b.templateFamily) d += 3; // family dominates
  if (a.background.style !== b.background.style) d += 1;
  if (a.motif !== b.motif) d += 1;
  if (a.accent !== b.accent) d += 1;
  if (a.emphasis !== b.emphasis) d += 1;
  if (a.cta.weight !== b.cta.weight) d += 1;
  return d;
}
