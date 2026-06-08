// POST /api/rasterize-svg
//
// Takes an SVG payload (the same SVG the Nano Banana preview builds for
// the "Download SVG (Figma-ready)" button) and returns a flattened PNG.
// Used by the "Download flat PNG" path to bypass Figma's SVG importer
// quirks (preserveAspectRatio not honored on <image>, embedded-raster
// resampling at viewport size, etc.). The output PNG carries all layers
// composited at the canvas's exact dimensions — sharp text via SVG's
// native vector rasterization, sharp images via the embedded base64.

import { NextResponse } from "next/server";
import sharp from "sharp";

const MAX_BYTES = 12 * 1024 * 1024; // 12 MB — generous for one SVG

export async function POST(req: Request) {
  const text = await req.text();
  if (!text || text.length > MAX_BYTES) {
    return NextResponse.json(
      { error: "invalid_svg_size", details: `payload empty or > ${MAX_BYTES} bytes` },
      { status: 400 },
    );
  }
  if (!text.includes("<svg")) {
    return NextResponse.json(
      { error: "not_svg", details: "payload doesn't contain an <svg> tag" },
      { status: 400 },
    );
  }
  try {
    const png = await sharp(Buffer.from(text), { density: 144 })
      .png({ compressionLevel: 9 })
      .toBuffer();
    return new Response(new Uint8Array(png), {
      status: 200,
      headers: {
        "content-type": "image/png",
        "cache-control": "no-store",
      },
    });
  } catch (err) {
    return NextResponse.json(
      { error: "rasterize_failed", details: (err as Error).message },
      { status: 500 },
    );
  }
}

export const maxDuration = 30;
export const dynamic = "force-dynamic";
