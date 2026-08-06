// ─────────────────────────────────────────────────────────────────────────────
// Language / locale metadata for the campaign generator.
//
// CANONICAL SET — the banner's supported languages are exactly the locales
// marketing-translator can produce compliant copy for. They are BCP-47 codes
// so the banner ↔ translator contract is 1:1 with no lossy short-code hop:
//
//   en-GB · fr-FR · it-IT · nl-NL · nl-BE · fr-BE · es-ES
//
// This list MUST stay in sync with the translator's SUPPORTED_LOCALES
// (marketing-translator/backend/src/services/campaignCopy.ts and
// packages/shared/src/index.ts `LocaleCode`). A banner locale the translator
// can't serve would burn AI concept generation before failing — so the two
// sets are kept identical on purpose.
//
// LEGACY: earlier briefs used 2-letter codes (en/fr/it/nl). Those are coerced
// to their regional locale on input (en→en-GB, …) so old saved campaigns and
// brand-kit data keep loading. Hebrew ("he") and Arabic ("ar") are NOT
// supported by the translator and are rejected at schema validation — a clear,
// cheap 400 long before any expensive generation runs.
//
// Each locale carries the four pieces of information the pipeline cares about:
//   1. rtl              — whether layout / text-align / CTA arrow flips
//   2. charWidthRatio   — used by fitFontToBox; varies by script
//   3. fontStack        — CSS font-family list, loaded via Google Fonts in the
//                          /render/ad/[adId] page.
//   4. arrow            — direction-appropriate Unicode arrow for the CTA
//
// Add new locales by appending to LANGUAGES + LANG_META (and the translator's
// SUPPORTED_LOCALES). The schema and forms pick up new options automatically.
// ─────────────────────────────────────────────────────────────────────────────

import { z } from "zod";

export const LANGUAGES = [
  "en-GB",
  "fr-FR",
  "it-IT",
  "nl-NL",
  "nl-BE",
  "fr-BE",
  "es-ES",
] as const;
export type Language = (typeof LANGUAGES)[number];

// Legacy 2-letter codes accepted on input and coerced to a regional locale.
// Unsupported legacy values (he, ar, …) are intentionally absent so they fall
// through to z.enum and get rejected.
export const LEGACY_LANGUAGE_ALIASES: Record<string, Language> = {
  en: "en-GB",
  fr: "fr-FR",
  it: "it-IT",
  nl: "nl-NL",
};

/** Coerce a legacy 2-letter code to its locale; pass locales through untouched. */
export function normalizeLanguageInput(value: unknown): unknown {
  if (typeof value !== "string") return value;
  const t = value.trim();
  if ((LANGUAGES as readonly string[]).includes(t)) return t;
  if (Object.prototype.hasOwnProperty.call(LEGACY_LANGUAGE_ALIASES, t)) {
    return LEGACY_LANGUAGE_ALIASES[t];
  }
  return t; // let z.enum reject unknown/unsupported values (he, ar, …)
}

export const LanguageSchema = z
  .preprocess(normalizeLanguageInput, z.enum(LANGUAGES))
  .default("en-GB");

export interface LanguageMeta {
  code: Language;
  englishName: string;
  nativeName: string;
  rtl: boolean;
  charWidthRatio: number;
  // CSS font-family stack — first match wins. The render route loads the
  // primary fonts via Google Fonts; system / sans-serif close the stack.
  fontStack: string;
  arrow: { forward: string };
  // Default risk-warning string used as a fallback when the brand kit
  // doesn't ship a localized disclaimer. Operators can still override
  // via brief.notes.
  fallbackDisclaimer: string;
  // Common consultant-ese / cliché words to avoid in this language.
  // Used by the critique pass.
  bannedClichés: string[];
}

// All currently supported locales are LTR (Latin script). The rtl field is
// retained for when/if an RTL locale is added to the translator.
const LATIN_FONT_STACK = '"Poppins", "Inter", system-ui, sans-serif';

const FR_DISCLAIMER =
  "Attention. Investir comporte un risque de perte. Des frais tiers et les Conditions générales s'appliquent.";
const NL_DISCLAIMER =
  "Let op. Beleggen brengt risico's met zich mee. Kosten van derden en Algemene voorwaarden zijn van toepassing.";
const FR_CLICHES = ["intelligent", "avenir", "potentiel", "révéler", "découvrez", "transformez", "réinventer", "libérez"];
const NL_CLICHES = ["slim", "slimmer", "toekomst", "potentieel", "ontdek", "ervaar", "transformeer", "ontgrendel"];

export const LANG_META: Record<Language, LanguageMeta> = {
  "en-GB": {
    code: "en-GB",
    englishName: "English (United Kingdom)",
    nativeName: "English (UK)",
    rtl: false,
    charWidthRatio: 0.55,
    fontStack: LATIN_FONT_STACK,
    arrow: { forward: "→" },
    fallbackDisclaimer:
      "Caution. Investing involves risk of loss. Third party fees and Terms & conditions apply.",
    bannedClichés: ["smart", "smarter", "future", "potential", "unlock", "discover", "experience", "elevate", "transform", "empower", "reimagine"],
  },
  "fr-FR": {
    code: "fr-FR",
    englishName: "French (France)",
    nativeName: "Français (France)",
    rtl: false,
    charWidthRatio: 0.56,
    fontStack: LATIN_FONT_STACK,
    arrow: { forward: "→" },
    fallbackDisclaimer: FR_DISCLAIMER,
    bannedClichés: FR_CLICHES,
  },
  "it-IT": {
    code: "it-IT",
    englishName: "Italian (Italy)",
    nativeName: "Italiano",
    rtl: false,
    charWidthRatio: 0.55,
    fontStack: LATIN_FONT_STACK,
    arrow: { forward: "→" },
    fallbackDisclaimer:
      "Attenzione. Investire comporta rischio di perdita. Si applicano commissioni di terzi e Termini e condizioni.",
    bannedClichés: ["intelligente", "futuro", "potenziale", "scopri", "rivela", "trasforma", "reinventa", "libera"],
  },
  "nl-NL": {
    code: "nl-NL",
    englishName: "Dutch (Netherlands)",
    nativeName: "Nederlands (NL)",
    rtl: false,
    charWidthRatio: 0.56,
    fontStack: LATIN_FONT_STACK,
    arrow: { forward: "→" },
    fallbackDisclaimer: NL_DISCLAIMER,
    bannedClichés: NL_CLICHES,
  },
  "nl-BE": {
    code: "nl-BE",
    englishName: "Dutch (Belgium)",
    nativeName: "Nederlands (BE)",
    rtl: false,
    charWidthRatio: 0.56,
    fontStack: LATIN_FONT_STACK,
    arrow: { forward: "→" },
    fallbackDisclaimer: NL_DISCLAIMER,
    bannedClichés: NL_CLICHES,
  },
  "fr-BE": {
    code: "fr-BE",
    englishName: "French (Belgium)",
    nativeName: "Français (Belgique)",
    rtl: false,
    charWidthRatio: 0.56,
    fontStack: LATIN_FONT_STACK,
    arrow: { forward: "→" },
    fallbackDisclaimer: FR_DISCLAIMER,
    bannedClichés: FR_CLICHES,
  },
  "es-ES": {
    code: "es-ES",
    englishName: "Spanish (Spain)",
    nativeName: "Español",
    rtl: false,
    charWidthRatio: 0.55,
    fontStack: LATIN_FONT_STACK,
    arrow: { forward: "→" },
    fallbackDisclaimer:
      "Atención. Invertir conlleva riesgo de pérdida. Se aplican comisiones de terceros y los Términos y condiciones.",
    bannedClichés: ["inteligente", "futuro", "potencial", "descubre", "revela", "transforma", "reinventa", "libera"],
  },
};

// Convenience helpers
export function isRtl(lang: Language): boolean {
  return LANG_META[lang].rtl;
}

export function nativeName(lang: Language): string {
  return LANG_META[lang].nativeName;
}

// CSS-ready URL for loading every supported locale's fonts in one request.
// Used by the /render/ad/[adId] page so headless Chromium has the right
// glyphs available. All supported locales are Latin-script, so one family
// (with weights) covers them.
export const GOOGLE_FONTS_HREF =
  "https://fonts.googleapis.com/css2?" +
  [
    "family=Poppins:wght@400;600;700;800&display=swap",
    "family=Inter:wght@400;600;700;800&display=swap",
  ].join("&");
