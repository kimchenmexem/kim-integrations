# Fonts — NOT the registry

This directory is **not** the source of truth for fonts. The MEXEM banner
pipeline loads brand fonts from Google Fonts via the URL declared in
[src/lib/i18n/language.ts](../../src/lib/i18n/language.ts) as
`GOOGLE_FONTS_HREF`. Both the production renderer
(`src/app/render/ad/[adId]/page.tsx`, `src/lib/render/renderCampaign.ts`) and
the Figma Adapter renderer (`src/lib/figmaAdapter/svgToPng.ts`) inject the
same `<link rel="stylesheet" href={GOOGLE_FONTS_HREF}>` into their HTML
wrappers, then await `document.fonts.ready` before screenshotting.

## To add a brand font

Edit `GOOGLE_FONTS_HREF` once. Adding a family there updates both pipelines.

## Why this directory still exists

Reserved for future opt-in additions (e.g. licensed brand fonts that aren't
on Google Fonts). Nothing in the code currently scans it — adding files here
has no effect.
