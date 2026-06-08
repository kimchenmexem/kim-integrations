// /nano-banana
//
// Standalone creative-banner section. Mirrors the brand pipeline's
// inputs (message, tone, locale) but routes to /api/generate-nano-banner
// instead of /api/generate-campaign. Output: one banner per submission,
// previewed inline.

import { NanoBananaForm } from "./NanoBananaForm";

// Load the same brand-pipeline fonts (Poppins for Latin, Heebo for Hebrew,
// Cairo for Arabic) so the preview renders identically to the deterministic
// renderer. Done via a Google Fonts <link> to keep this page self-contained.
const BRAND_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Poppins:wght@400;500;600;700;800&display=swap",
    "family=Heebo:wght@400;500;600;700;800&display=swap",
    "family=Cairo:wght@400;500;600;700;800&display=swap",
  ].join("&");

export default function NanoBananaPage() {
  return (
    <section className="space-y-8">
      {/* eslint-disable-next-line @next/next/no-page-custom-font */}
      <link rel="stylesheet" href={BRAND_FONTS_HREF} />
      <header className="space-y-2">
        <h1 className="text-2xl font-semibold tracking-tight">
          Nano Banana — creative banner
        </h1>
        <p className="text-sm text-zinc-600 dark:text-zinc-400">
          Generate a single-banner campaign using Google Gemini 2.5 Flash Image
          for the visual, marketing-translator for the copy, and MEXEM brand
          rules for colors + zone overlays. Standalone — does not touch the
          deterministic campaign pipeline.
        </p>
      </header>
      <NanoBananaForm />
    </section>
  );
}
