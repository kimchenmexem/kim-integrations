# MEXEM banner — reference design rules

Extracted from 5 production reference banners (4 leaderboards + 1 portrait) supplied by the brand team. These are the **target rules** the AI Visual Planner + renderer should produce. Where current behavior differs, this doc flags the mismatch.

---

## 0. Critical brand-spec mismatch (read this first)

The reference banners use **YELLOW** as the dominant accent color, not the red `#D81222` listed in [brand-input/brand-spec/brand-spec.json](../brand-input/brand-spec/brand-spec.json) (where red is documented as the *IBKR* partnership color).

Estimated yellow from screenshots: **`#F5C518`** (similar to brand yellow used on MEXEM's website / app BUY button).

Action items:
1. Confirm with brand team whether yellow is now the primary accent.
2. If yes — add yellow to `brand-spec.json` under `colors.accent` and regenerate `brand-kit-lite.generated.json`.
3. Red (`#D81222`) stays as the dedicated IBKR partnership color and shouldn't be used for general accent.

Until that's confirmed, the renderer keeps using red. After confirmation, swap accent → yellow and the rules below become directly executable.

---

## 1. Color palette (target)

| Token | Hex | Usage |
|---|---|---|
| Primary navy darkest | `#00122C` | Background top-left, gradient start |
| Primary navy bright | `#006A97` | Background bottom-right, gradient end |
| Accent yellow | `#F5C518` | Headline emphasis word, highlight elements (NOT used on CTA — see §6) |
| Pure white | `#FFFFFF` | Headline non-emphasis text, sub-text, disclaimer, CTA pill (portrait) |
| Disclaimer white | `#FFFFFF` @ 0.85 opacity | Disclaimer line |
| IBKR red | `#D81222` | Reserved for "Powered by InteractiveBrokers" lockup ONLY |
| CTA dark text | `#0A0F1F` (near-black) | Text on yellow CTA band, text on white CTA pill |

**Hard rule:** outside the IBKR partnership lockup, red is **not used**. Yellow is the only accent.

---

## 2. Background (all formats)

- **Linear gradient**, ~135° (top-left → bottom-right) from `#00122C` → `#006A97`.
- The right side of the canvas (where the visual sits in leaderboards) is slightly LIGHTER, creating a subtle vignette behind the device mockup.
- Subtle ghost candlestick pattern in the unused canvas region at very low opacity (~0.06–0.08). Optional. Used in the portrait example below the CTA, in the bottom 30% of the canvas.
- **No motif** (no chart silhouette, no wave curve, no node network). The references are intentionally clean — visual variety comes from the device mockup, not from generated SVG ornaments.

---

## 3. Logo placement

### Leaderboard (1200×628)
- MEXEM wordmark only (white, landscape variant).
- Position: top-left, padding ~50px from edges.
- Size: ~200px wide × ~50px tall (about 17% of canvas width).
- **No "Powered by InteractiveBrokers" sub-lockup on the leaderboard.**

### Portrait (1080×1920)
- MEXEM wordmark, centered horizontally near the top.
- Size: ~700px wide (much larger — ~65% of canvas width).
- **WITH "Powered by InteractiveBrokers" sub-lockup directly below**, including the small red "IB" icon.
- Vertical position: top ~10–15% of canvas.

### Square (1080×1080)
- Not in the references. Best estimate: MEXEM wordmark centered top, ~50% of canvas width, with optional "Powered by IB" sub-lockup below.

---

## 4. Headline — the most distinctive rule

### Two-color split
The headline ALWAYS has TWO colors:
- **First part = the "key claim"** → rendered in **yellow** (`#F5C518`)
- **Rest of the headline** → rendered in **white** (`#FFFFFF`)

Examples from references:
| Yellow part | White part |
|---|---|
| `ONE INVESTING ACCOUNT.` | `ACCESS ACROSS EVERY DEVICE.` |
| `GLOBAL INVESTING,` | `LOCAL SUPPORT.` |
| `INVEST BEYOND STOCKS` | `WITH OPTIONS TRADING` |
| `ACCESS FUTURES TRADING` | `IN ONE PLATFORM` |
| `BUILD YOUR ISA AND GET UP TO £1000 IN CASH!` (portrait) | (single color in this case — portrait variant treats the £1000 as the visual emphasis instead) |

The yellow part is typically the **first sentence/clause** ending in a comma or period. The white part is the supporting clause.

### Typography
- **ALL CAPS** always.
- Sans-serif, bold (700+).
- Tight letter-spacing (negative tracking ~ -1 to -2).
- Multi-line wrap is fine — wrap at natural word boundaries.
- **No drop shadow.** No outline. Pure flat type.
- Line-height ~1.05 (lines hugging close).

### Sizing
| Format | Headline font-size |
|---|---|
| 1200×628 leaderboard | ~85–95 px |
| 1080×1080 square | ~70–80 px (estimated) |
| 1080×1920 portrait | ~120–160 px (the references show very large portrait headlines) |

### Mega-stat treatment (portrait only)
When the headline contains a numeric/currency figure (`£1000`, `$0`, `150+`), that figure can be rendered at **2× the surrounding headline size** as a "stat hero" — see the ISA reference. Other lines wrap around it.

---

## 5. Disclaimer

- **Color:** white (`#FFFFFF`) at full opacity.
- **Font size:** ~22–26px on leaderboard, ~28–32px on portrait.
- **Placement:** ALWAYS between the headline block and the CTA — NOT at the very bottom under the CTA.
- **Wrapping:** single line on leaderboard ("Caution. Investing involves risk of loss."). Two lines on portrait if longer.
- **Centered alignment** on portrait. **Left-aligned** on leaderboard (matching the headline's text-block).
- No legal-band rectangle behind it. Just text on the gradient.

---

## 6. CTA — one form, every format

**Updated against the brand-input example SVGs.** All 21 example banners in [brand-input/banner-examples/](../brand-input/banner-examples/) use the same CTA design — a white rounded pill with black bold text. There is no yellow-band variant. The doc's previous "leaderboard = yellow band" rule was a misinterpretation and has been removed (along with the matching QA checks `leaderboard-cta-not-bottom-band` and `leaderboard-cta-not-yellow`).

**Universal CTA design:**
- **Background:** white `#FFFFFF` (solid, no gradient, no border).
- **Text:** "START INVESTING" — ALL CAPS, black `#000000`, Poppins bold (`font_weight: 700`), centered.
- **Border-radius:** ~17% of button height (measured ratio across 12 example SVGs ranges 0.149–0.196; we use 0.17).
- **Font size:** 39% of CTA height (constant `CTA_FONT_SIZE_RATIO = 0.39`). Measured across the example SVGs the ratio is 0.388–0.392 — extremely tight, so a fixed constant is safe. Enforced by `applyMexemZones()` during the zone snap; the AI's font-size choice is overridden.
- **Border / shadow:** none.

**Per-format CTA box** (position and size) is owned by the `cta` zone in §8 below. The CTA *styling* above is enforced by [src/lib/formats/mexemZones.ts](../src/lib/formats/mexemZones.ts) → `CTA_STYLE`, applied during the zone snap. Every CTA element coming out of `applyMexemZones()` carries these exact values.

**Source SVGs the CTA design was extracted from:**

| Format | Pill box (from SVG) | Border-radius |
|---|---|---|
| 300×250 | (14, 167, 112.7, 29) | 4.33 |
| 336×280 | (11, 195, 124, 25.7) | 5.04 |
| 1080×1080 | (293, 855, 492, 102) | 20 |
| 1080×1920 | (336, 837, 408, 84.6) | 16.59 |
| 1200×629 | (43, 484, 321, 66.5) | 10 |
| 1200×1200 | (326, 950, 547, 113.3) | 22.22 |
| 960×1200 | (319, 606, 321, 66.5) | 10 |
| 728×93 | (591, 26, 124, 25.7) | 5.04 |

(The current `cta` zones in §8 use these positions for the formats where the SVG and PDF agree, and our derived values otherwise. Where you want pixel-exact alignment to a brand example, copy the row above into `MEXEM_ZONES`.)

---

## 7. Visual region (the device mockup)

### Leaderboard
- **Position:** right side of canvas, x ≈ 50–55% of canvas width onward.
- **Width:** about 40–45% of canvas width.
- **Vertical:** centered or slightly below middle, leaving room for the CTA band at bottom.
- **Content variants:**
  - Single phone (with chart) + accessory props (headphones, chat bubbles with country flags).
  - Multi-device (laptop + phone + watch) clustered together.
  - Two phones side by side (one app screen, one login screen).
- **Drop shadow:** subtle, soft shadow under devices.
- **No frame, no decoration around** — devices float on the gradient.

### Portrait
- **Position:** bottom of canvas, centered horizontally.
- **Width:** ~60–70% of canvas width.
- **Vertical:** bottom 25–30% of canvas.
- **Content:** single phone, larger.
- **Background under phone:** the subtle ghost candlestick pattern fills around the phone for context.

---

## 8. Layout grids

Each format defines 5 zones — `logo`, `text`, `cta`, `risk_msg`, `element` — given as an axis-aligned bounding box `(x, y, width, height)` in canvas pixels with origin top-left.

These tables are the **authoritative source of truth** for banner layout: they're loaded verbatim by [src/lib/formats/mexemZones.ts](../src/lib/formats/mexemZones.ts) into `MEXEM_ZONES`, and [src/lib/ai/buildAdSpecsFromPlan.ts](../src/lib/ai/buildAdSpecsFromPlan.ts) snaps every element with a matching role to its zone after the AI plan is built. The AI no longer decides positions — it only chooses copy + concept + visual.

**Provenance:**
- Widths × heights for the 7 formats below are transcribed from `MEXEM_Banner_Specifications.pdf` Section 1 (the brand team's annotated screenshots).
- X/Y are derived from the PDF's Section 2 spacing callouts ("34px top, 10px left logo inset, …") and the appendix screenshots.
- The role → zone mapping is fixed: `logo→logo`, `headline/subheadline/body→text` (each at a **fixed sub-slot** — see below), `cta→cta`, `legal-disclaimer→risk_msg`, `product_visual/hero-image/supporting-image→element`. Decorative *text* elements (eyebrow, kicker, stat label) are **hidden** (`visible: false`) since they have no fixed slot. Background and decorative *shapes* are not snapped.

<!-- BEGIN AUTO-GENERATED FROM MEXEM_ZONES — do not edit by hand; run `npm run docs:zones` to regenerate -->

**Layout classes** (every format belongs to exactly one):

| Class | Formats |
|---|---|
| Wide leaderboard | `1200x628`, `970x250` |
| Tall portrait | `1080x1920`, `960x1200`, `300x1050`, `300x600` |
| Square | `1080x1080`, `1200x1200`, `250x250` |
| Compact rectangle | `300x250`, `336x280` |
| Narrow skyscraper | `160x600` |
| Placement marker | `320x100`, `320x50`, `728x90` |

**Text sub-slots inside the `text` zone.** The text zone is split top-to-bottom into three fixed bands. Each text role lands in its own band regardless of whether the other roles exist. Values come from `TEXT_SLOT_RATIOS` in `mexemZones.ts`.

| Role | Vertical span (fraction of text zone height) |
|---|---|
| headline | 60% (0.00 → 0.60) |
| subheadline | 25% (0.60 → 0.85) |
| body | 15.000000000000002% (0.85 → 1.00) |

**Role → zone mapping** (the contract `applyMexemZones()` enforces at render time):

| Element role | Zone | Notes |
|---|---|---|
| `logo` | `logo` | Snapped 1:1 |
| `headline` | `text` → headline sub-slot | top fraction of the text zone |
| `subheadline` | `text` → subheadline sub-slot | next fraction; skipped on formats with `noSubheadline: true` |
| `body` | `text` → body sub-slot | bottom fraction |
| `cta` | `cta` | Snapped 1:1 + style enforced (see CTA section below) |
| `legal-disclaimer` | `risk_msg` | Snapped 1:1 |
| `product_visual`, `hero-image`, `supporting-image` | `element` | Snapped 1:1 |
| anything else with `type: "text"` | hidden (`visible: false`) | Decorative text has no fixed slot |

**CTA styling** (applied by `applyMexemZones()` to every element snapped to the `cta` zone):

- Background: `#FFFFFF` (white pill)
- Text color: `#000000` (pure black)
- Font: Poppins 700
- Border radius: `0.17` × zone height (≈ 17% of pill height)
- Font size: `0.39` × zone height (≈ 39% of pill height)
- Object-fit on image fills: `contain`

### 1200×628 — LinkedIn / Facebook leaderboard

- **Class:** Wide leaderboard
- **Canvas:** 1200 × 628 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 54 | 54 | 456 | 90 |
| text | 54 | 170 | 711 | 161 |
| cta | 43 | 484 | 321 | 67 |
| risk_msg | 0 | 562 | 1200 | 66 |
| element | 770 | 65 | 426 | 410 |

### 970×250 — IAB billboard

- **Class:** Wide leaderboard
- **Canvas:** 970 × 250 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 40 | 25 | 240 | 36 |
| text | 40 | 75 | 700 | 100 |
| cta | 40 | 178 | 200 | 32 |
| risk_msg | 0 | 221 | 970 | 29 |
| element | 760 | 0 | 210 | 220 |

### 1080×1920 — Story / portrait

- **Class:** Tall portrait
- **Canvas:** 1080 × 1920 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 144 | 182 | 787 | 171 |
| text | 71 | 460 | 938 | 534 |
| cta | 71 | 1100 | 938 | 87 |
| risk_msg | 71 | 1220 | 938 | 83 |
| element | 0 | 1340 | 1080 | 568 |

### 960×1200 — Social portrait 4:5

- **Class:** Tall portrait
- **Canvas:** 960 × 1200 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 215 | 89 | 523 | 98 |
| text | 107 | 270 | 746 | 297 |
| cta | 300 | 600 | 359 | 86 |
| risk_msg | 0 | 1134 | 960 | 66 |
| element | 0 | 720 | 960 | 371 |

### 300×1050 — Portrait skyscraper

- **Class:** Tall portrait
- **Canvas:** 300 × 1050 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 10 | 10 | 280 | 36 |
| text | 12 | 280 | 280 | 200 |
| cta | 67 | 491 | 165 | 34 |
| risk_msg | 0 | 1009 | 300 | 41 |
| element | 0 | 560 | 300 | 440 |

### 300×600 — Vertical half-page

- **Class:** Tall portrait
- **Canvas:** 300 × 600 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 10 | 10 | 280 | 32 |
| text | 18 | 110 | 264 | 140 |
| cta | 53 | 275 | 193 | 50 |
| risk_msg | 10 | 340 | 280 | 28 |
| element | 0 | 370 | 300 | 230 |

### 1080×1080 — Instagram feed square

- **Class:** Square
- **Canvas:** 1080 × 1080 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 70 | 70 | 457 | 100 |
| text | 70 | 200 | 535 | 502 |
| cta | 70 | 750 | 535 | 85 |
| risk_msg | 0 | 968 | 1080 | 112 |
| element | 615 | 140 | 373 | 811 |

### 1200×1200 — LinkedIn / generic square

- **Class:** Square
- **Canvas:** 1200 × 1200 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 256 | 86 | 688 | 141 |
| text | 175 | 320 | 850 | 275 |
| cta | 421 | 650 | 358 | 85 |
| risk_msg | 0 | 1098 | 1200 | 102 |
| element | 0 | 760 | 1200 | 348 |

### 250×250 — Square compact

- **Class:** Square
- **Canvas:** 250 × 250 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 9 | 8 | 130 | 22 |
| text | 9 | 70 | 130 | 90 |
| cta | 9 | 174 | 124 | 26 |
| risk_msg | 0 | 229 | 250 | 21 |
| element | 141 | 43 | 109 | 186 |

### 300×250 — Compact rectangle

- **Class:** Compact rectangle
- **Canvas:** 300 × 250 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 10 | 10 | 153 | 29 |
| text | 10 | 50 | 184 | 100 |
| cta | 10 | 165 | 125 | 26 |
| risk_msg | 0 | 225 | 300 | 25 |
| element | 190 | 40 | 104 | 171 |

### 336×280 — Compact rectangle larger variant

- **Class:** Compact rectangle
- **Canvas:** 336 × 280 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 10 | 10 | 153 | 30 |
| text | 10 | 55 | 185 | 101 |
| cta | 10 | 175 | 125 | 26 |
| risk_msg | 0 | 252 | 336 | 28 |
| element | 200 | 23 | 136 | 234 |

### 160×600 — Narrow skyscraper

- **Class:** Narrow skyscraper
- **Canvas:** 160 × 600 px
- **`noSubheadline`:** `false`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 10 | 10 | 140 | 24 |
| text | 7 | 130 | 145 | 110 |
| cta | 18 | 260 | 124 | 26 |
| risk_msg | 0 | 566 | 160 | 34 |
| element | 0 | 310 | 160 | 240 |

### 320×100 — Wide micro mobile banner *(no subheadline)*

- **Class:** Placement marker
- **Canvas:** 320 × 100 px
- **`noSubheadline`:** `true`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 10 | 12 | 70 | 16 |
| text | 86 | 28 | 145 | 35 |
| cta | 140 | 67 | 50 | 12 |
| risk_msg | 0 | 88 | 320 | 12 |
| element | 235 | 5 | 85 | 75 |

### 320×50 — Ultra-wide mobile banner *(no subheadline)*

- **Class:** Placement marker
- **Canvas:** 320 × 50 px
- **`noSubheadline`:** `true`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 5 | 8 | 60 | 14 |
| text | 70 | 10 | 195 | 26 |
| cta | 265 | 15 | 50 | 12 |
| risk_msg | 0 | 41 | 320 | 9 |
| element | 315 | 0 | 5 | 41 |

### 728×90 — IAB leaderboard *(no subheadline)*

- **Class:** Placement marker
- **Canvas:** 728 × 90 px
- **`noSubheadline`:** `true`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | 10 | 10 | 110 | 30 |
| text | 130 | 15 | 350 | 50 |
| cta | 485 | 27 | 130 | 36 |
| risk_msg | 0 | 78 | 728 | 12 |
| element | 620 | 10 | 80 | 60 |

> All 15 formats declared in `CampaignFormatSchema` have zone tables defined in `MEXEM_ZONES`.

<!-- END AUTO-GENERATED -->

---

## 9. Decorative elements

The references are **deliberately minimal**:
- No motifs (chart_silhouette, wave_curve, etc.) — except the very subtle candlestick texture in the portrait background.
- No patterns (diagonal lines, dot grid).
- No corner brackets.
- No badges or chips.

Visual variety comes from:
1. Device mockup choice (single phone vs multi-device vs phone+headphones)
2. Subtle background gradient direction (lighter on the right where visual is)
3. The 2-color headline split

**Implication for the AI Visual Planner:** for campaigns matching this reference style, primary_visual should be `mockup` or `screenshot`, motif should be `none`, pattern should be `none`. The current "motif-led" output style does NOT match these references.

---

## 10. Differences vs current renderer (action list)

| Property | Current renderer | Reference target | Priority |
|---|---|---|---|
| Accent color | Red `#D81222` | Yellow `#F5C518` | **HIGH** — confirm with brand team first |
| Headline | Single color (white on dark) | 2-color split (yellow first part, white rest) | **HIGH** — needs new manifest field + AI prompt rule |
| CTA (all formats) | Filled pill, brand-blue / varying styles | White rounded pill, black bold Poppins, ~17% radius | **DONE** — enforced by `CTA_STYLE` in `mexemZones.ts` |
| Disclaimer position | Below CTA | Above CTA, between headline and CTA | MEDIUM — small layout change |
| Decorative motifs | Often visible (chart, wave, etc.) | None or very subtle candlestick texture | MEDIUM — already a knob (use_motif) |
| Logo on portrait | Top-left, small | Top-center, large, with IBKR sub-lockup | MEDIUM — new orientation rule |
| Visual region | Various sizes | Right ~40–45% on leaderboard, bottom ~25–30% on portrait | LOW — close to today |
| Background gradient | 135° navy gradient | Same — already matches | ✓ |
| Typography | Poppins, ALL CAPS, bold | Same — already matches | ✓ |

---

## 11. Recommended implementation order

If brand team confirms yellow as accent:

1. **Color first** — add yellow to `brand-spec.json`, regenerate `brand-kit-lite.generated.json`. Replace `accent_usage` color resolution to use yellow instead of red. Red stays only on the IBKR sub-lockup.
2. **Two-color headline** — add a `headline_emphasis_split` field to the manifest's headline element. Renderer wraps the first sentence in yellow `<span>`, rest in white. AI prompt teaches the rule.
3. **Leaderboard CTA band** — add a new CTA layout primitive `bottom_band` (full-width, sharp corners, anchored to canvas bottom). Add `cta_strategy.placement="bottom_band"` enum value or treat as a refinement of `bottom_center` when format=leaderboard.
4. **Portrait CTA color** — when format=1080×1920, default CTA fill to white (with dark text) instead of brand-blue.
5. **Logo orientation** — when format=1080×1920, render logo top-center with `Powered by InteractiveBrokers` sub-lockup beneath.
6. **Disclaimer positioning** — move disclaimer to between headline and CTA (above CTA), not below.
7. **Motif suppression** — for campaigns marked "production" / "reference-style", default motif to `none` and pattern to `none`.

Each item is a small, self-contained change. None require renderer rewrites — they're additions to the existing primitives.

---

## 12. AI prompt addendum (when implementing)

When the system prompt is updated for reference-style banners, it should include:

```
HEADLINE STRUCTURE — 2-color split mandatory:
  - The first clause (ending in comma or period) is the "key claim" and renders in YELLOW.
  - The remaining clause(s) render in WHITE.
  - Examples:
    "ONE INVESTING ACCOUNT." (yellow) + "ACCESS ACROSS EVERY DEVICE." (white)
    "GLOBAL INVESTING," (yellow) + "LOCAL SUPPORT." (white)
  - Write headlines that have a natural break where the emphasis ends.
  - ALL CAPS always. No drop shadow.

DECORATIVE LAYERS — minimal by default:
  - No motif unless the brief explicitly asks for "data feel" or "chart aesthetic".
  - No pattern unless the brief asks for "texture-led".
  - The visual variety comes from the device mockup choice + the headline split, not from generated SVG.

CTA — one form, every format:
  - White rounded pill, black bold Poppins, ~17% border-radius.
  - Text: "START INVESTING" (or whatever the brief defines), ALL CAPS, centered.
  - Position comes from the per-format `cta` zone in BANNER_REFERENCE_RULES §8.
  - Style enforced automatically by `applyMexemZones()`; the AI shouldn't pick CTA colors.
```

---

## 13. References

The 5 reference banners this document is built from:
1. Portrait — "Build your ISA and get up to £1000 in cash!" + AAPL phone mockup
2. Leaderboard — "Global Investing, Local Support." + phone+headphones+flags
3. Leaderboard — "One Investing Account. Access across every device." + multi-device
4. Leaderboard — "Invest Beyond Stocks With Options Trading" + laptop+phone
5. Leaderboard — "Access Futures Trading In One Platform" + two phones

Saved by the operator on 2026-05-06.
