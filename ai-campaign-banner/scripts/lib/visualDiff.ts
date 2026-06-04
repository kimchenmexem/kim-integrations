import { promises as fs } from "node:fs";
import sharp from "sharp";

export interface DiffResult {
  differingPixels: number;
  totalPixels: number;
  drift: number;
  width: number;
  height: number;
  sameSize: boolean;
}

const PER_CHANNEL_TOLERANCE = 6;

export const VISUAL_DIFF_MAX_DIMENSION = 512;

async function normalizedRaw(input: string | Buffer): Promise<{ data: Buffer; info: sharp.OutputInfo }> {
  return sharp(input)
    .resize({
      width: VISUAL_DIFF_MAX_DIMENSION,
      height: VISUAL_DIFF_MAX_DIMENSION,
      fit: "inside",
      withoutEnlargement: true,
    })
    .removeAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
}

export async function diffPngFiles(baselinePath: string, currentPath: string): Promise<DiffResult> {
  const [base, cur] = await Promise.all([normalizedRaw(baselinePath), normalizedRaw(currentPath)]);
  if (base.info.width !== cur.info.width || base.info.height !== cur.info.height) {
    return {
      differingPixels: base.info.width * base.info.height,
      totalPixels: base.info.width * base.info.height,
      drift: 1,
      width: base.info.width,
      height: base.info.height,
      sameSize: false,
    };
  }
  const baseBuf = base.data;
  const curBuf = cur.data;
  const channels = base.info.channels;
  const totalPixels = base.info.width * base.info.height;
  let differing = 0;
  for (let i = 0; i < baseBuf.length; i += channels) {
    let exceeded = false;
    for (let c = 0; c < 3 && c < channels; c += 1) {
      if (Math.abs(baseBuf[i + c] - curBuf[i + c]) > PER_CHANNEL_TOLERANCE) {
        exceeded = true;
        break;
      }
    }
    if (exceeded) differing += 1;
  }
  return {
    differingPixels: differing,
    totalPixels,
    drift: differing / Math.max(1, totalPixels),
    width: base.info.width,
    height: base.info.height,
    sameSize: true,
  };
}

export async function writeDiffOverlay(baselinePath: string, currentPath: string, outPath: string): Promise<void> {
  const [base, cur] = await Promise.all([normalizedRaw(baselinePath), normalizedRaw(currentPath)]);
  if (base.info.width !== cur.info.width || base.info.height !== cur.info.height) {
    await fs.copyFile(currentPath, outPath);
    return;
  }
  const channels = base.info.channels;
  const out = Buffer.alloc(base.data.length);
  for (let i = 0; i < base.data.length; i += channels) {
    let exceeded = false;
    for (let c = 0; c < 3 && c < channels; c += 1) {
      if (Math.abs(base.data[i + c] - cur.data[i + c]) > PER_CHANNEL_TOLERANCE) {
        exceeded = true;
        break;
      }
    }
    if (exceeded) {
      out[i] = 255;
      out[i + 1] = 0;
      out[i + 2] = 0;
      if (channels > 3) out[i + 3] = 255;
    } else {
      const gray = Math.round(0.3 * cur.data[i] + 0.59 * cur.data[i + 1] + 0.11 * cur.data[i + 2]);
      out[i] = gray;
      out[i + 1] = gray;
      out[i + 2] = gray;
      if (channels > 3) out[i + 3] = 255;
    }
  }
  await sharp(out, { raw: { width: base.info.width, height: base.info.height, channels } })
    .png()
    .toFile(outPath);
}
