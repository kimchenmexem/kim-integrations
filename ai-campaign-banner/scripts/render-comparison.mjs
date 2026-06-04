import { promises as fs } from "node:fs";
import path from "node:path";
import { chromium } from "playwright";

const dir = "/tmp/figma-comparison";
const files = (await fs.readdir(dir)).filter((f) => f.endsWith(".svg"));

const browser = await chromium.launch({ headless: true });
const ctx = await browser.newContext();
for (const f of files) {
  const svg = await fs.readFile(path.join(dir, f), "utf8");
  const w = Number((svg.match(/width="(\d+)"/) || [])[1] || 1200);
  const h = Number((svg.match(/height="(\d+)"/) || [])[1] || 628);
  const page = await ctx.newPage();
  await page.setViewportSize({ width: w, height: h });
  await page.setContent(`<!doctype html><html><body style="margin:0;padding:0;background:#222;">${svg}</body></html>`);
  await page.screenshot({ path: path.join(dir, f.replace(/\.svg$/, ".png")), fullPage: true });
  await page.close();
  console.log("rendered", f, w, "x", h);
}
await browser.close();
