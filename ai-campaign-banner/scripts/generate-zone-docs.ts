// scripts/generate-zone-docs.ts
//
// Regenerates the §8 "Layout grids" section of
// docs/BANNER_REFERENCE_RULES.md from the live MEXEM_ZONES constant in
// src/lib/formats/mexemZones.ts. Run via `npm run docs:zones`, and
// automatically by `npm run build` (prebuild hook).
//
// Only the content BETWEEN the auto-gen marker comments is rewritten:
//   <!-- BEGIN AUTO-GENERATED FROM MEXEM_ZONES — do not edit by hand;
//        run `npm run docs:zones` to regenerate -->
//   ...this region is replaced...
//   <!-- END AUTO-GENERATED -->
//
// Everything outside the markers is preserved exactly. The generator
// pulls `label`, `class`, `canvas`, `noSubheadline`, and the five
// zones directly from the canonical MEXEM_ZONES data — no parallel
// metadata table here.

import { promises as fs } from "node:fs";
import path from "node:path";
import {
  MEXEM_ZONES,
  TEXT_SLOT_RATIOS,
  CTA_BORDER_RADIUS_RATIO,
  CTA_FONT_SIZE_RATIO,
  type FormatZones,
  type LayoutClass,
  type ZoneBox,
} from "../src/lib/formats/mexemZones";
import { CampaignFormatSchema } from "../src/lib/schemas/campaignBrief.schema";

const ROLE_TO_ZONE_DOC = `\
**Role → zone mapping** (the contract \`applyMexemZones()\` enforces at render time):

| Element role | Zone | Notes |
|---|---|---|
| \`logo\` | \`logo\` | Snapped 1:1 |
| \`headline\` | \`text\` → headline sub-slot | top fraction of the text zone |
| \`subheadline\` | \`text\` → subheadline sub-slot | next fraction; skipped on formats with \`noSubheadline: true\` |
| \`body\` | \`text\` → body sub-slot | bottom fraction |
| \`cta\` | \`cta\` | Snapped 1:1 + style enforced (see CTA section below) |
| \`legal-disclaimer\` | \`risk_msg\` | Snapped 1:1 |
| \`product_visual\`, \`hero-image\`, \`supporting-image\` | \`element\` | Snapped 1:1 |
| anything else with \`type: "text"\` | hidden (\`visible: false\`) | Decorative text has no fixed slot |
`;

function fmtBox(box: ZoneBox): string {
  const round = (n: number) => (Number.isInteger(n) ? `${n}` : `${n.toFixed(1)}`);
  return `${round(box.x)} | ${round(box.y)} | ${round(box.width)} | ${round(box.height)}`;
}

function tableFor(format: string, layout: FormatZones): string {
  const noSub = layout.noSubheadline === true ? " *(no subheadline)*" : "";
  return `### ${format.replace("x", "×")} — ${layout.label}${noSub}

- **Class:** ${layout.class}
- **Canvas:** ${layout.canvas.width} × ${layout.canvas.height} px
- **\`noSubheadline\`:** \`${layout.noSubheadline === true}\`

| Zone | x | y | width | height |
|---|---|---|---|---|
| logo | ${fmtBox(layout.logo)} |
| text | ${fmtBox(layout.text)} |
| cta | ${fmtBox(layout.cta)} |
| risk_msg | ${fmtBox(layout.risk_msg)} |
| element | ${fmtBox(layout.element)} |`;
}

function buildSubSlotTable(): string {
  const rows = (["headline", "subheadline", "body"] as const).map((role) => {
    const { startRatio, endRatio } = TEXT_SLOT_RATIOS[role];
    const span = `${(endRatio - startRatio) * 100}%`;
    return `| ${role} | ${span} (${startRatio.toFixed(2)} → ${endRatio.toFixed(2)}) |`;
  });
  return `**Text sub-slots inside the \`text\` zone.** The text zone is split top-to-bottom into three fixed bands. Each text role lands in its own band regardless of whether the other roles exist. Values come from \`TEXT_SLOT_RATIOS\` in \`mexemZones.ts\`.

| Role | Vertical span (fraction of text zone height) |
|---|---|
${rows.join("\n")}`;
}

function buildCtaSection(): string {
  return `**CTA styling** (applied by \`applyMexemZones()\` to every element snapped to the \`cta\` zone):

- Background: \`#FFFFFF\` (white pill)
- Text color: \`#000000\` (pure black)
- Font: Poppins 700
- Border radius: \`${CTA_BORDER_RADIUS_RATIO}\` × zone height (≈ ${Math.round(CTA_BORDER_RADIUS_RATIO * 100)}% of pill height)
- Font size: \`${CTA_FONT_SIZE_RATIO}\` × zone height (≈ ${Math.round(CTA_FONT_SIZE_RATIO * 100)}% of pill height)
- Object-fit on image fills: \`contain\``;
}

function buildClassSummary(zones: typeof MEXEM_ZONES, supported: string[]): string {
  const byClass = new Map<LayoutClass, string[]>();
  for (const fmt of supported) {
    const z = zones[fmt as keyof typeof zones];
    if (!z) continue;
    const list = byClass.get(z.class) ?? [];
    list.push(fmt);
    byClass.set(z.class, list);
  }
  const lines: string[] = [
    `**Layout classes** (every format belongs to exactly one):`,
    ``,
    `| Class | Formats |`,
    `|---|---|`,
  ];
  // Canonical class order.
  const ORDER: LayoutClass[] = [
    "Wide leaderboard",
    "Tall portrait",
    "Square",
    "Compact rectangle",
    "Narrow skyscraper",
    "Placement marker",
  ];
  for (const cls of ORDER) {
    const list = byClass.get(cls);
    if (!list || list.length === 0) continue;
    lines.push(`| ${cls} | ${list.map((f) => `\`${f}\``).join(", ")} |`);
  }
  return lines.join("\n");
}

function buildSection(zones: typeof MEXEM_ZONES, supported: string[]): string {
  const lines: string[] = [];
  lines.push(buildClassSummary(zones, supported));
  lines.push("");
  lines.push(buildSubSlotTable());
  lines.push("");
  lines.push(ROLE_TO_ZONE_DOC);
  lines.push(buildCtaSection());
  lines.push("");
  // Order by class, then by canonical declaration order within the class.
  const ORDER: LayoutClass[] = [
    "Wide leaderboard",
    "Tall portrait",
    "Square",
    "Compact rectangle",
    "Narrow skyscraper",
    "Placement marker",
  ];
  const grouped = new Map<LayoutClass, string[]>();
  for (const fmt of supported) {
    const z = zones[fmt as keyof typeof zones];
    if (!z) continue;
    const list = grouped.get(z.class) ?? [];
    list.push(fmt);
    grouped.set(z.class, list);
  }
  for (const cls of ORDER) {
    const list = grouped.get(cls);
    if (!list) continue;
    for (const fmt of list) {
      const z = zones[fmt as keyof typeof zones];
      if (!z) continue;
      lines.push(tableFor(fmt, z));
      lines.push("");
    }
  }
  const covered = supported.filter((f) => zones[f as keyof typeof zones]);
  const uncovered = supported.filter((f) => !zones[f as keyof typeof zones]);
  if (uncovered.length > 0) {
    lines.push(`### Formats not yet covered

The following formats are declared in \`CampaignFormatSchema\` but have no entry in \`MEXEM_ZONES\` — they fall back to the legacy position-computing path:

${uncovered.map((f) => `- \`${f}\``).join("\n")}`);
  } else {
    lines.push(`> All ${covered.length} formats declared in \`CampaignFormatSchema\` have zone tables defined in \`MEXEM_ZONES\`.`);
  }
  return lines.join("\n");
}

const BEGIN_MARKER =
  "<!-- BEGIN AUTO-GENERATED FROM MEXEM_ZONES — do not edit by hand; run `npm run docs:zones` to regenerate -->";
const END_MARKER = "<!-- END AUTO-GENERATED -->";

async function main() {
  const docPath = path.join(__dirname, "..", "docs", "BANNER_REFERENCE_RULES.md");
  const original = await fs.readFile(docPath, "utf8");
  const beginIdx = original.indexOf(BEGIN_MARKER);
  const endIdx = original.indexOf(END_MARKER);
  if (beginIdx === -1 || endIdx === -1 || endIdx < beginIdx) {
    throw new Error(
      `Auto-gen markers not found in ${docPath}. Expected:\n  ${BEGIN_MARKER}\n  ${END_MARKER}`,
    );
  }
  const supported = CampaignFormatSchema.options as readonly string[];
  const newSection = buildSection(MEXEM_ZONES, [...supported]);
  const before = original.slice(0, beginIdx + BEGIN_MARKER.length);
  const after = original.slice(endIdx);
  const next = `${before}\n\n${newSection}\n\n${after}`;
  if (next === original) {
    console.log("docs/BANNER_REFERENCE_RULES.md — §8 already in sync with MEXEM_ZONES");
    return;
  }
  await fs.writeFile(docPath, next, "utf8");
  console.log(
    `docs/BANNER_REFERENCE_RULES.md updated — ${supported.length} formats, ${Object.keys(MEXEM_ZONES).length} with zone tables`,
  );
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
