// scripts/validate-zones.ts
//
// Tests the canonical MEXEM banner contract against the live data in
// src/lib/formats/mexemZones.ts. Run via `npm run test:zones`.
//
// What this enforces (must all hold, in order):
//   1. Every canonical banner size exists in MEXEM_ZONES.
//   2. Each banner's canvas width / height matches the canonical value.
//   3. Each banner's class matches the canonical value.
//   4. Each banner has logo, text, cta, risk_msg, and element zones.
//   5. Every zone's x, y, width, height matches the canonical value.
//   6. Every zone stays inside its canvas:
//      x >= 0, y >= 0, width > 0, height > 0,
//      x + width  <= canvas.width,
//      y + height <= canvas.height.
//   7. noSubheadline is true for {728x90, 320x100, 320x50} only,
//      and is false (or omitted) for every other format.
//
// On any failure: log the failure and exit non-zero. On success: log a
// short summary and exit 0.

import { MEXEM_ZONES, type FormatZones, type LayoutClass } from "../src/lib/formats/mexemZones";

// ── Canonical data (mirrors the prompt-provided source of truth) ────

interface CanonicalBanner {
  size: string;
  label: string;
  class: LayoutClass;
  canvas: { width: number; height: number };
  noSubheadline: boolean;
  zones: {
    logo: { x: number; y: number; width: number; height: number };
    text: { x: number; y: number; width: number; height: number };
    cta: { x: number; y: number; width: number; height: number };
    risk_msg: { x: number; y: number; width: number; height: number };
    element: { x: number; y: number; width: number; height: number };
  };
}

const CANONICAL: CanonicalBanner[] = [
  {
    size: "1200x628",
    label: "LinkedIn / Facebook leaderboard",
    class: "Wide leaderboard",
    canvas: { width: 1200, height: 628 },
    noSubheadline: false,
    zones: {
      logo: { x: 54, y: 54, width: 456, height: 90 },
      text: { x: 54, y: 170, width: 711, height: 161 },
      cta: { x: 43, y: 484, width: 321, height: 67 },
      risk_msg: { x: 0, y: 562, width: 1200, height: 66 },
      element: { x: 770, y: 65, width: 426, height: 410 },
    },
  },
  {
    size: "970x250",
    label: "IAB billboard",
    class: "Wide leaderboard",
    canvas: { width: 970, height: 250 },
    noSubheadline: false,
    zones: {
      logo: { x: 40, y: 25, width: 240, height: 36 },
      text: { x: 40, y: 75, width: 700, height: 100 },
      cta: { x: 40, y: 178, width: 200, height: 32 },
      risk_msg: { x: 0, y: 221, width: 970, height: 29 },
      element: { x: 760, y: 0, width: 210, height: 220 },
    },
  },
  {
    size: "1080x1920",
    label: "Story / portrait",
    class: "Tall portrait",
    canvas: { width: 1080, height: 1920 },
    noSubheadline: false,
    zones: {
      logo: { x: 144, y: 182, width: 787, height: 171 },
      text: { x: 71, y: 460, width: 938, height: 534 },
      cta: { x: 71, y: 1100, width: 938, height: 87 },
      risk_msg: { x: 71, y: 1220, width: 938, height: 83 },
      element: { x: 0, y: 1340, width: 1080, height: 568 },
    },
  },
  {
    size: "960x1200",
    label: "Social portrait 4:5",
    class: "Tall portrait",
    canvas: { width: 960, height: 1200 },
    noSubheadline: false,
    zones: {
      logo: { x: 215, y: 89, width: 523, height: 98 },
      text: { x: 107, y: 270, width: 746, height: 297 },
      cta: { x: 300, y: 600, width: 359, height: 86 },
      risk_msg: { x: 0, y: 1134, width: 960, height: 66 },
      element: { x: 0, y: 720, width: 960, height: 371 },
    },
  },
  {
    size: "300x1050",
    label: "Portrait skyscraper",
    class: "Tall portrait",
    canvas: { width: 300, height: 1050 },
    noSubheadline: false,
    zones: {
      logo: { x: 10, y: 10, width: 280, height: 36 },
      text: { x: 12, y: 280, width: 280, height: 200 },
      cta: { x: 67, y: 491, width: 165, height: 34 },
      risk_msg: { x: 0, y: 1009, width: 300, height: 41 },
      element: { x: 0, y: 560, width: 300, height: 440 },
    },
  },
  {
    size: "300x600",
    label: "Vertical half-page",
    class: "Tall portrait",
    canvas: { width: 300, height: 600 },
    noSubheadline: false,
    zones: {
      logo: { x: 10, y: 10, width: 280, height: 32 },
      text: { x: 18, y: 110, width: 264, height: 140 },
      cta: { x: 53, y: 275, width: 193, height: 50 },
      risk_msg: { x: 10, y: 340, width: 280, height: 28 },
      element: { x: 0, y: 370, width: 300, height: 230 },
    },
  },
  {
    size: "1080x1080",
    label: "Instagram feed square",
    class: "Square",
    canvas: { width: 1080, height: 1080 },
    noSubheadline: false,
    zones: {
      logo: { x: 70, y: 70, width: 457, height: 100 },
      text: { x: 70, y: 200, width: 535, height: 502 },
      cta: { x: 70, y: 750, width: 535, height: 85 },
      risk_msg: { x: 0, y: 968, width: 1080, height: 112 },
      element: { x: 615, y: 140, width: 373, height: 811 },
    },
  },
  {
    size: "1200x1200",
    label: "LinkedIn / generic square",
    class: "Square",
    canvas: { width: 1200, height: 1200 },
    noSubheadline: false,
    zones: {
      logo: { x: 256, y: 86, width: 688, height: 141 },
      text: { x: 175, y: 320, width: 850, height: 275 },
      cta: { x: 421, y: 650, width: 358, height: 85 },
      risk_msg: { x: 0, y: 1098, width: 1200, height: 102 },
      element: { x: 0, y: 760, width: 1200, height: 348 },
    },
  },
  {
    size: "250x250",
    label: "Square compact",
    class: "Square",
    canvas: { width: 250, height: 250 },
    noSubheadline: false,
    zones: {
      logo: { x: 9, y: 8, width: 130, height: 22 },
      text: { x: 9, y: 70, width: 130, height: 90 },
      cta: { x: 9, y: 174, width: 124, height: 26 },
      risk_msg: { x: 0, y: 229, width: 250, height: 21 },
      element: { x: 141, y: 43, width: 109, height: 186 },
    },
  },
  {
    size: "300x250",
    label: "Compact rectangle",
    class: "Compact rectangle",
    canvas: { width: 300, height: 250 },
    noSubheadline: false,
    zones: {
      logo: { x: 10, y: 10, width: 153, height: 29 },
      text: { x: 10, y: 50, width: 184, height: 100 },
      cta: { x: 10, y: 165, width: 125, height: 26 },
      risk_msg: { x: 0, y: 225, width: 300, height: 25 },
      element: { x: 190, y: 40, width: 104, height: 171 },
    },
  },
  {
    size: "336x280",
    label: "Compact rectangle larger variant",
    class: "Compact rectangle",
    canvas: { width: 336, height: 280 },
    noSubheadline: false,
    zones: {
      logo: { x: 10, y: 10, width: 153, height: 30 },
      text: { x: 10, y: 55, width: 185, height: 101 },
      cta: { x: 10, y: 175, width: 125, height: 26 },
      risk_msg: { x: 0, y: 252, width: 336, height: 28 },
      element: { x: 200, y: 23, width: 136, height: 234 },
    },
  },
  {
    size: "160x600",
    label: "Narrow skyscraper",
    class: "Narrow skyscraper",
    canvas: { width: 160, height: 600 },
    noSubheadline: false,
    zones: {
      logo: { x: 10, y: 10, width: 140, height: 24 },
      text: { x: 7, y: 130, width: 145, height: 110 },
      cta: { x: 18, y: 260, width: 124, height: 26 },
      risk_msg: { x: 0, y: 566, width: 160, height: 34 },
      element: { x: 0, y: 310, width: 160, height: 240 },
    },
  },
  {
    size: "728x90",
    label: "IAB leaderboard",
    class: "Placement marker",
    canvas: { width: 728, height: 90 },
    noSubheadline: true,
    zones: {
      logo: { x: 10, y: 10, width: 110, height: 30 },
      text: { x: 130, y: 15, width: 350, height: 50 },
      cta: { x: 485, y: 27, width: 130, height: 36 },
      risk_msg: { x: 0, y: 78, width: 728, height: 12 },
      element: { x: 620, y: 10, width: 80, height: 60 },
    },
  },
  {
    size: "320x100",
    label: "Wide micro mobile banner",
    class: "Placement marker",
    canvas: { width: 320, height: 100 },
    noSubheadline: true,
    zones: {
      logo: { x: 10, y: 12, width: 70, height: 16 },
      text: { x: 86, y: 28, width: 145, height: 35 },
      cta: { x: 140, y: 67, width: 50, height: 12 },
      risk_msg: { x: 0, y: 88, width: 320, height: 12 },
      element: { x: 235, y: 5, width: 85, height: 75 },
    },
  },
  {
    size: "320x50",
    label: "Ultra-wide mobile banner",
    class: "Placement marker",
    canvas: { width: 320, height: 50 },
    noSubheadline: true,
    zones: {
      logo: { x: 5, y: 8, width: 60, height: 14 },
      text: { x: 70, y: 10, width: 195, height: 26 },
      cta: { x: 265, y: 15, width: 50, height: 12 },
      risk_msg: { x: 0, y: 41, width: 320, height: 9 },
      element: { x: 315, y: 0, width: 5, height: 41 },
    },
  },
];

const EXPECTED_NO_SUB = new Set(["728x90", "320x100", "320x50"]);
const ZONE_NAMES = ["logo", "text", "cta", "risk_msg", "element"] as const;
type ZoneKey = (typeof ZONE_NAMES)[number];

let failures = 0;
function fail(msg: string): void {
  console.error(`✗ ${msg}`);
  failures++;
}

function checkRect(
  context: string,
  actual: { x: number; y: number; width: number; height: number } | undefined,
  expected: { x: number; y: number; width: number; height: number },
): void {
  if (!actual) {
    fail(`${context}: missing`);
    return;
  }
  for (const prop of ["x", "y", "width", "height"] as const) {
    if (actual[prop] !== expected[prop]) {
      fail(`${context}.${prop}: got ${actual[prop]}, expected ${expected[prop]}`);
    }
  }
}

function checkInsideCanvas(
  context: string,
  zone: { x: number; y: number; width: number; height: number },
  canvas: { width: number; height: number },
): void {
  if (zone.x < 0) fail(`${context}: x < 0 (${zone.x})`);
  if (zone.y < 0) fail(`${context}: y < 0 (${zone.y})`);
  if (zone.width <= 0) fail(`${context}: width <= 0 (${zone.width})`);
  if (zone.height <= 0) fail(`${context}: height <= 0 (${zone.height})`);
  if (zone.x + zone.width > canvas.width) {
    fail(`${context}: right edge ${zone.x + zone.width} > canvas.width ${canvas.width}`);
  }
  if (zone.y + zone.height > canvas.height) {
    fail(`${context}: bottom edge ${zone.y + zone.height} > canvas.height ${canvas.height}`);
  }
}

const tested = new Set<string>();

for (const c of CANONICAL) {
  const fmt = c.size;
  tested.add(fmt);
  const z = MEXEM_ZONES[fmt as keyof typeof MEXEM_ZONES] as FormatZones | undefined;

  // 1. Banner exists
  if (!z) {
    fail(`${fmt}: missing from MEXEM_ZONES`);
    continue;
  }

  // 2. Canvas
  if (z.canvas.width !== c.canvas.width) {
    fail(`${fmt}.canvas.width: got ${z.canvas.width}, expected ${c.canvas.width}`);
  }
  if (z.canvas.height !== c.canvas.height) {
    fail(`${fmt}.canvas.height: got ${z.canvas.height}, expected ${c.canvas.height}`);
  }

  // 3. Layout class
  if (z.class !== c.class) {
    fail(`${fmt}.class: got "${z.class}", expected "${c.class}"`);
  }

  // 4 + 5. Zones present and match values exactly
  for (const name of ZONE_NAMES) {
    checkRect(`${fmt}.${name}`, z[name as ZoneKey], c.zones[name as ZoneKey]);
  }

  // 6. Every zone stays inside its canvas
  for (const name of ZONE_NAMES) {
    const zone = z[name as ZoneKey];
    if (zone) checkInsideCanvas(`${fmt}.${name}`, zone, z.canvas);
  }

  // 7. noSubheadline rule
  const flag = z.noSubheadline === true;
  const shouldBeTrue = EXPECTED_NO_SUB.has(fmt);
  if (flag !== shouldBeTrue) {
    fail(
      `${fmt}.noSubheadline: got ${z.noSubheadline ?? false}, expected ${shouldBeTrue}`,
    );
  }
  // Sanity: canonical declaration of the flag also matches expected set.
  if (c.noSubheadline !== shouldBeTrue) {
    fail(
      `${fmt}: canonical data sets noSubheadline=${c.noSubheadline} but expected ${shouldBeTrue}`,
    );
  }
}

// Cross-check: ensure no MEXEM_ZONES entries are extra/unexpected.
for (const fmt of Object.keys(MEXEM_ZONES)) {
  if (!tested.has(fmt)) {
    fail(`MEXEM_ZONES["${fmt}"] is not in the canonical contract`);
  }
}

if (failures > 0) {
  console.error(`\n${failures} failure(s). MEXEM_ZONES is out of sync with the canonical contract.`);
  process.exit(1);
}
console.log(
  `✓ All ${CANONICAL.length} canonical banners validated — every zone, canvas, class, and noSubheadline flag matches.`,
);
