/**
 * Campaign Generator — from a single "what we want to promote" brief,
 * produce ready-to-use marketing copy for every platform / asset slot
 * we ship, in one structured OpenAI call.
 *
 * Design notes:
 *   • One call (gpt-4o, JSON mode). Cheaper, more cohesive across
 *     platforms, less moving parts than fanning out per-asset.
 *   • Compliance constraints (no guaranteed returns, no urgency, etc.)
 *     are injected via the same forbidden-phrases pipeline as the
 *     translator. Reviewer-flagged ForbiddenPhrase rows apply here too.
 *   • Output not persisted in v1. The frontend can route a chosen
 *     variant through Single Translate for full persistence + review.
 */

import { extractTranslation, lazyOpenAI } from "./openaiHelpers";
import {
  listActiveForbiddenPhrasesForLocale,
  formatForbiddenPhrasesBlock,
} from "../compliance/forbidden/service";
import { loadBundle } from "../compliance/bundles/loader";
import { getLocaleStyleGuide } from "./ai";

const openai = lazyOpenAI(120_000);

/** Asset catalogue. Char limits match the existing textTypes options. */
export const PLATFORM_CATALOGUE: PlatformSpec[] = [
  {
    id: "google_search",
    name: "Google Search",
    assets: [
      { format: "headline", label: "Headline", maxChars: 30, count: 3 },
      { format: "description", label: "Description", maxChars: 90, count: 2 },
    ],
  },
  {
    id: "google_display",
    name: "Google Display",
    assets: [
      { format: "short_headline", label: "Short Headline", maxChars: 30, count: 3 },
      { format: "long_headline", label: "Long Headline", maxChars: 90, count: 2 },
      { format: "description", label: "Description", maxChars: 90, count: 2 },
    ],
  },
  {
    id: "google_pmax",
    name: "Google Performance Max",
    assets: [
      { format: "short_headline", label: "Short Headline", maxChars: 30, count: 3 },
      { format: "long_headline", label: "Long Headline", maxChars: 90, count: 2 },
      { format: "description", label: "Description", maxChars: 90, count: 2 },
    ],
  },
  {
    id: "youtube",
    name: "YouTube",
    assets: [
      { format: "headline", label: "Ad Headline", maxChars: 30, count: 3 },
      { format: "description", label: "Description", maxChars: 90, count: 2 },
    ],
  },
  {
    id: "meta",
    name: "Meta (Facebook / Instagram)",
    assets: [
      { format: "primary_text", label: "Primary Text", maxChars: 125, count: 3 },
      { format: "headline", label: "Headline", maxChars: 40, count: 3 },
      { format: "long_headline", label: "Long Headline", maxChars: 100, count: 2 },
      { format: "description", label: "Link Description", maxChars: 30, count: 2 },
    ],
  },
  {
    id: "email",
    name: "Email",
    assets: [
      { format: "subject", label: "Subject Line", maxChars: 60, count: 3 },
      { format: "body", label: "Body (short)", maxChars: 400, count: 1 },
    ],
  },
  {
    id: "organic_social",
    name: "Organic Social Post",
    assets: [
      { format: "post", label: "Post", maxChars: 240, count: 3 },
    ],
  },
  {
    id: "sms",
    name: "SMS",
    assets: [{ format: "body", label: "SMS Body", maxChars: 160, count: 2 }],
  },
  {
    id: "push",
    name: "Push Notification",
    assets: [{ format: "body", label: "Push Body", maxChars: 100, count: 2 }],
  },
  {
    id: "landing",
    name: "Landing Page",
    assets: [
      { format: "headline", label: "Hero Headline", maxChars: 70, count: 3 },
      { format: "subhead", label: "Hero Subhead", maxChars: 160, count: 2 },
      { format: "cta", label: "CTA Button", maxChars: 25, count: 3 },
    ],
  },
];

const LOCALE_LANGUAGE: Record<string, string> = {
  "it-IT": "Italian",
  "fr-FR": "French",
  "nl-NL": "Dutch",
  "nl-BE": "Dutch (Belgium)",
  "fr-BE": "French (Belgium)",
  "es-ES": "Spanish",
  "en-GB": "English (UK)",
};

export interface AssetSpec {
  /** Slot identifier within the platform (e.g. "headline", "description"). */
  format: string;
  /** Human label shown in the UI. */
  label: string;
  /** Hard character limit. The model must respect this. */
  maxChars: number;
  /** How many variants to generate for this slot. */
  count: number;
}

export interface PlatformSpec {
  id: string;
  name: string;
  assets: AssetSpec[];
}

export interface CampaignGenerationInput {
  brief: string;
  locale: string;
  persona?: string;
  tone?: string;
  /** Optional: filter to a subset of PLATFORM_CATALOGUE ids. */
  platforms?: string[];
}

export interface CampaignAssetResult {
  format: string;
  label: string;
  maxChars: number;
  variants: string[];
}

export interface CampaignPlatformResult {
  id: string;
  name: string;
  assets: CampaignAssetResult[];
}

export interface CampaignGenerationResult {
  brief: string;
  locale: string;
  language: string;
  platforms: CampaignPlatformResult[];
  generatedAt: string;
}

function selectPlatforms(filter?: string[]): PlatformSpec[] {
  if (!filter || filter.length === 0) return PLATFORM_CATALOGUE;
  const set = new Set(filter);
  return PLATFORM_CATALOGUE.filter((p) => set.has(p.id));
}

export async function generateCampaign(input: CampaignGenerationInput): Promise<CampaignGenerationResult> {
  if (!process.env.OPENAI_API_KEY) {
    throw new Error("OPENAI_API_KEY is required for campaign generation.");
  }

  const language = LOCALE_LANGUAGE[input.locale] ?? input.locale;
  const platforms = selectPlatforms(input.platforms);
  const personaLine = input.persona ? `\nAUDIENCE: ${input.persona}` : "";
  const toneLine = input.tone ? `\nTONE: ${input.tone}` : "";
  // Locale-specific register / style (e.g. it-IT must use "tu", not "Lei";
  // fr-FR uses "vous"; etc.). Same source as Single / Quick / Batch.
  const styleGuide = getLocaleStyleGuide(input.locale);
  const styleBlock = styleGuide ? `\n\n${styleGuide}` : "";

  // Same compliance signal as the translator: published-bundle banned
  // phrases + reviewer-flagged ForbiddenPhrase rows, joined.
  const bundle = await loadBundle(input.locale);
  const bundleBans = bundle?.content.bannedPhrases ?? [];
  const reviewerBans = await listActiveForbiddenPhrasesForLocale(input.locale);
  const allBans = Array.from(new Set([...bundleBans, ...reviewerBans]));
  const banBlock = allBans.length
    ? `\nCOMPLIANCE — BANNED PHRASES (must not appear in any variant, no matter what): ${allBans.map((b) => `"${b}"`).join(", ")}.`
    : "";
  const forbiddenBlock = formatForbiddenPhrasesBlock(reviewerBans);

  // Build a single structured prompt asking for one JSON object back.
  const slotList = platforms.map((p) => ({
    id: p.id,
    name: p.name,
    assets: p.assets.map((a) => ({
      format: a.format,
      label: a.label,
      maxChars: a.maxChars,
      count: a.count,
    })),
  }));

  const systemPrompt = `You are a senior marketing copywriter for MEXEM, a regulated European trading platform. Given a campaign brief, produce ready-to-publish copy for every platform / asset slot listed below, in ${language} (${input.locale}).${personaLine}${toneLine}${styleBlock}

WRITING PRINCIPLES:
- Stay faithful to the campaign brief's meaning. Do not invent facts, products, or claims.
- Write so each variant reads naturally to a native ${language} reader.
- Vary phrasing and angle across variants of the same asset — different opening words, different structure, fresh vocabulary.
- Preserve brand names (MEXEM, WisdomTree) and any asterisks (*) exactly.
- Keep tone factual and professional. This is a regulated platform.

HARD CONSTRAINTS:
- Each variant MUST be ≤ the asset's maxChars (count characters strictly, including spaces and punctuation).
- Never imply guaranteed returns, capital safety, or risk-free investing.
- Do not create artificial urgency or scarcity.
- Do not write personalised investment advice ("you should invest", "we recommend buying", etc.).${banBlock}${forbiddenBlock}

OUTPUT FORMAT: Return ONLY valid JSON matching this exact shape — no preamble, no markdown, no code fences:
{
  "platforms": [
    {
      "id": "<platform id from the spec>",
      "assets": [
        {
          "format": "<asset format from the spec>",
          "variants": ["<variant 1>", "<variant 2>", ...]
        }
      ]
    }
  ]
}
Every platform in the spec MUST appear. Every asset within each platform MUST appear with exactly the requested number of variants.`;

  const userMessage = `CAMPAIGN BRIEF:
${input.brief.trim()}

PLATFORMS AND ASSETS TO PRODUCE:
${JSON.stringify(slotList, null, 2)}`;

  const response = await openai.chat.completions.create({
    model: "gpt-4o",
    messages: [
      { role: "system", content: systemPrompt },
      { role: "user", content: userMessage },
    ],
    temperature: 0.7,
    max_tokens: 4000,
    response_format: { type: "json_object" },
  });

  const raw = extractTranslation(response);
  let parsed: { platforms?: Array<{ id: string; assets: Array<{ format: string; variants: string[] }> }> };
  try {
    parsed = JSON.parse(raw);
  } catch {
    throw new Error("Campaign generator returned non-JSON output.");
  }
  if (!parsed.platforms || !Array.isArray(parsed.platforms)) {
    throw new Error("Campaign generator JSON missing 'platforms' array.");
  }

  // Stitch the model's response back to the catalogue so we keep labels +
  // maxChars on the output, drop any unknown ids, and validate lengths.
  const byPlatformId = new Map(parsed.platforms.map((p) => [p.id, p]));
  const platformsOut: CampaignPlatformResult[] = platforms.map((spec) => {
    const modelEntry = byPlatformId.get(spec.id);
    const assetsOut: CampaignAssetResult[] = spec.assets.map((assetSpec) => {
      const modelAsset = modelEntry?.assets?.find((a) => a.format === assetSpec.format);
      const variants = Array.isArray(modelAsset?.variants) ? modelAsset!.variants : [];
      // Trim any variant that breached the maxChars contract; the prompt
      // told the model not to, but defence in depth.
      const cleaned = variants
        .filter((v) => typeof v === "string" && v.trim().length > 0)
        .map((v) => v.length > assetSpec.maxChars ? v.slice(0, assetSpec.maxChars).trimEnd() : v);
      return {
        format: assetSpec.format,
        label: assetSpec.label,
        maxChars: assetSpec.maxChars,
        variants: cleaned,
      };
    });
    return { id: spec.id, name: spec.name, assets: assetsOut };
  });

  return {
    brief: input.brief,
    locale: input.locale,
    language,
    platforms: platformsOut,
    generatedAt: new Date().toISOString(),
  };
}
