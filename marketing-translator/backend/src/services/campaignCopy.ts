/**
 * Campaign-copy generator.
 *
 * Single-call OpenAI prompt that produces a full localized ad copy package
 * (headline, subheadline, body, cta, disclaimer) for a campaign brief in
 * one shot. The result is then run through the existing compliance
 * decision layer per text field; the aggregated issues + suggestions are
 * surfaced to the caller as a flat string[] in `complianceNotes`.
 *
 * No persistence in v1 — every call is stateless.
 */

import type { LocaleCode } from "@mexem/shared";
import type {
  CampaignCopyRequest,
  CampaignCopyResponse,
  CampaignCopyBatchRequest,
  CampaignCopyBatchResponse,
  CampaignCopyBatchConceptResult,
  CampaignCopyByMessageRequest,
  CampaignCopyByMessageResponse,
  LocaleDirection,
} from "@mexem/shared";
import { lazyOpenAI, extractTranslation } from "./openaiHelpers";
import { validateCompliance } from "./compliance";
import { applyLocaleRewrites } from "./translationRewrites";

// Deterministic post-process — re-uses the locale rewrite layer wired into
// runTranslationJob. Without this, the campaign-copy generators (which
// bypass the standard translate pipeline) would never benefit from the
// brand's term-level overrides (ETFs→ETF, EU-aandelen→Europese aandelen,
// négociation→trading, …). Runs after compliance has been computed on the
// LLM's draft so compliance still sees what the model produced — only the
// shipped text is rewritten. If a rule changes anything we log it.
function rewriteString(text: string | undefined, locale: string, logTag: string): string | undefined {
  if (!text) return text;
  const out = applyLocaleRewrites(text, locale);
  if (out.fired.length > 0) {
    console.log(
      `[rewrites] ${locale} ${logTag}: ${out.fired.map((r) => r.id).join(", ")}`
    );
  }
  return out.text;
}

const openai = lazyOpenAI(60_000);

const MODEL = "gpt-4o";

const SUPPORTED_LOCALES: LocaleCode[] = [
  "it-IT",
  "fr-FR",
  "nl-NL",
  "nl-BE",
  "fr-BE",
  "es-ES",
  "en-GB",
];

// All currently supported locales are LTR. Hebrew/Arabic are not yet
// supported by the translator; if they are added, extend this map.
const RTL_LOCALES = new Set<LocaleCode>([]);

function localeDirection(locale: LocaleCode): LocaleDirection {
  return RTL_LOCALES.has(locale) ? "rtl" : "ltr";
}

function localeLanguageLabel(locale: LocaleCode): string {
  const map: Record<LocaleCode, string> = {
    "it-IT": "Italian (Italy)",
    "fr-FR": "French (France)",
    "nl-NL": "Dutch (Netherlands)",
    "nl-BE": "Dutch (Belgium)",
    "fr-BE": "French (Belgium)",
    "es-ES": "Spanish (Spain)",
    "en-GB": "English (United Kingdom)",
  };
  return map[locale];
}

export class UnsupportedLocaleError extends Error {
  constructor(locale: string) {
    super(`Locale "${locale}" is not supported by /api/campaign-copy.`);
    this.name = "UnsupportedLocaleError";
  }
}

interface RawCopyFromModel {
  headline: string;
  subheadline: string;
  body?: string;
  cta: string;
  disclaimer: string;
}

const REQUIRED_KEYS: ReadonlyArray<keyof RawCopyFromModel> = [
  "headline",
  "subheadline",
  "cta",
  "disclaimer",
];

function buildSystemPrompt(locale: LocaleCode, riskWarningRequired: boolean): string {
  const language = localeLanguageLabel(locale);
  const riskClause = riskWarningRequired
    ? "Include a regulator-appropriate risk warning in the disclaimer field."
    : "Keep the disclaimer minimal but legally appropriate.";
  return [
    `You write localized financial-marketing ad copy in ${language}.`,
    `Output every text field directly in ${language}. Do not output English unless the target language IS English.`,
    `Tone must be professional, factual, and compliant with EU financial-marketing regulation (ESMA / national regulator equivalents).`,
    `Style: calm, concrete, platform-led. Prefer specific product/value language ("market access", "tools", "data", "platform") over campaign slogans.`,
    `Avoid: guarantees of return, urgency tactics, superlative claims ("best", "leader"), oversimplification ("easy", "effortless"), and aggressive trading language ("command", "dominate", "win", "stay ahead", "beat the market", "unlock").`,
    `Avoid vague CTA nouns such as "options", "strategy", and "insights" unless the brief explicitly asks for those products.`,
    `If compliance guidance supplies an exact disclaimer, use that wording verbatim in the disclaimer field.`,
    riskClause,
    `Return STRICT JSON only, no prose, with the exact keys: headline, subheadline, body, cta, disclaimer.`,
    `headline: punchy, ≤ 60 chars. subheadline: one supporting line, ≤ 120 chars. body: optional supporting paragraph, ≤ 280 chars. cta: ≤ 24 chars action phrase. disclaimer: regulator-appropriate compliance line.`,
  ].join("\n");
}

function buildUserPrompt(req: CampaignCopyRequest): string {
  const tone = Array.isArray(req.tone) ? req.tone.join(", ") : req.tone;
  const lines: string[] = [
    `Marketing message: ${req.brief.marketingMessage}`,
    `Campaign goal: ${req.brief.campaignGoal}`,
    `Tone: ${tone}`,
  ];
  if (req.brief.targetAudience) lines.push(`Target audience: ${req.brief.targetAudience}`);
  if (req.brief.notes) lines.push(`Additional notes: ${req.brief.notes}`);
  if (req.complianceNotes) lines.push(`Compliance guidance: ${req.complianceNotes}`);
  if (req.conceptHint) {
    const hint: string[] = [];
    if (req.conceptHint.name) hint.push(`name="${req.conceptHint.name}"`);
    if (req.conceptHint.strategicIdea) hint.push(`strategic_idea="${req.conceptHint.strategicIdea}"`);
    if (hint.length > 0) lines.push(`Concept: ${hint.join(", ")}`);
  }
  lines.push("");
  lines.push(`Return JSON: { "headline": "...", "subheadline": "...", "body": "...", "cta": "...", "disclaimer": "..." }`);
  return lines.join("\n");
}

function parseModelJson(content: string): RawCopyFromModel {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Model returned non-JSON content for campaign copy.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model returned a non-object JSON value.");
  }
  const obj = parsed as Record<string, unknown>;
  for (const k of REQUIRED_KEYS) {
    const v = obj[k];
    if (typeof v !== "string" || v.trim() === "") {
      throw new Error(`Model output is missing required field "${k}".`);
    }
  }
  const out: RawCopyFromModel = {
    headline: (obj.headline as string).trim(),
    subheadline: (obj.subheadline as string).trim(),
    cta: (obj.cta as string).trim(),
    disclaimer: (obj.disclaimer as string).trim(),
  };
  if (typeof obj.body === "string" && obj.body.trim() !== "") {
    out.body = obj.body.trim();
  }
  return out;
}

async function aggregateComplianceNotes(
  copy: RawCopyFromModel,
  locale: LocaleCode,
): Promise<string[]> {
  const fields: Array<{ label: string; text: string }> = [
    { label: "headline", text: copy.headline },
    { label: "subheadline", text: copy.subheadline },
    { label: "cta", text: copy.cta },
    { label: "disclaimer", text: copy.disclaimer },
  ];
  if (copy.body) fields.push({ label: "body", text: copy.body });

  const results = await Promise.all(
    fields.map(async (f) => {
      try {
        const r = await validateCompliance(f.text, locale);
        return { label: f.label, ...r };
      } catch {
        return null;
      }
    }),
  );

  // validateCompliance returns `suggestions` as `issues.map(i => "Address: " + i)`
  // — strictly redundant with `issues`. Report only issues so callers don't
  // see every violation twice.
  const notes: string[] = [];
  for (const r of results) {
    if (!r) continue;
    for (const issue of r.issues ?? []) notes.push(`[${r.label}] ${issue}`);
  }
  return notes;
}

// ── Batch generator ─────────────────────────────────────────────────────────
//
// One OpenAI call produces copy for every concept in the campaign. This is
// strictly better than per-concept calls in two ways:
//   1. Cross-concept variation: the model sees all concepts at once and is
//      explicitly told to make headlines / CTAs distinct. Eliminates the
//      "Explore Your Options × 3" problem seen with independent calls.
//   2. Latency: one round-trip instead of N, at the cost of one larger
//      prompt. For 3 concepts this is typically faster and cheaper than
//      3 parallel single-concept calls.

function buildBatchSystemPrompt(
  locale: LocaleCode,
  conceptCount: number,
  riskWarningRequired: boolean,
): string {
  const language = localeLanguageLabel(locale);
  const riskClause = riskWarningRequired
    ? "Each disclaimer must include a regulator-appropriate risk warning."
    : "Each disclaimer must be minimal but legally appropriate.";
  return [
    `You write localized financial-marketing ad copy in ${language}.`,
    `You are designing copy for ${conceptCount} distinct concepts inside ONE campaign.`,
    `Output every text field directly in ${language}. Do not output English unless the target language IS English.`,
    `Tone must be professional, factual, and compliant with EU financial-marketing regulation (ESMA / national regulator equivalents).`,
    `Style: calm, concrete, platform-led. Prefer specific product/value language ("market access", "tools", "data", "platform") over campaign slogans.`,
    `Avoid: guarantees of return, urgency tactics, superlative claims ("best", "leader"), oversimplification ("easy", "effortless"), and aggressive trading language ("command", "dominate", "win", "stay ahead", "beat the market", "unlock").`,
    `Avoid vague CTA nouns such as "options", "strategy", and "insights" unless the brief explicitly asks for those products.`,
    `If compliance guidance supplies an exact disclaimer, use that wording verbatim in every disclaimer field.`,
    riskClause,
    ``,
    `CROSS-CONCEPT RULES (critical — the concepts share a campaign, the copy MUST NOT):`,
    `- Every concept gets a DISTINCT headline. No shared key phrases between concepts.`,
    `- Every concept gets a DISTINCT CTA — use a different neutral action verb in each (e.g. "Explore platform", "Compare markets", "View tools", "See markets"). Do not repeat a CTA verbatim. Avoid "Start" unless the campaign goal is conversion.`,
    `- Every subheadline must reflect that concept's own strategic_idea / target_emotion / mood; subheadlines must not be interchangeable across concepts.`,
    `- Disclaimers may follow a shared regulator pattern but should vary in wording where natural.`,
    ``,
    `OPTIONAL TYPOGRAPHIC ACCENTS — produce when they strengthen a concept (omit when not natural; never include for every concept):`,
    `- "eyebrow": a SHORT, ALL-CAPS category label that sits above the headline (1-3 words, ≤ 40 chars). Use for clear category framing (e.g. "ETF TRADING", "PROFESSIONAL PLATFORM"). NEVER include numeric claims, percentages, or money amounts in the eyebrow.`,
    `- "kicker": a short supporting pull-quote-style line below the subheadline (≤ 120 chars). Use sparingly — only when it adds a memorable framing that the subhead alone doesn't carry. Like every other field it must be regulator-compliant.`,
    `DO NOT produce "stat" (specific numbers / percentages / dollar amounts) — those are regulatory claims that must come from a verified human-approved source, never from this model.`,
    ``,
    `Per-field length: headline ≤ 60 chars · subheadline ≤ 120 chars · body ≤ 280 chars (optional) · cta ≤ 24 chars · disclaimer = regulator-appropriate · eyebrow ≤ 40 chars (optional) · kicker ≤ 120 chars (optional).`,
    ``,
    `Return STRICT JSON only, no prose. Top-level shape:`,
    `{ "concepts": [ { "conceptId": "...", "headline": "...", "subheadline": "...", "body": "...", "cta": "...", "disclaimer": "...", "eyebrow": "...", "kicker": "..." }, ... ] }`,
    `The "conceptId" in each output MUST exactly equal the conceptId you were given. Omit "eyebrow" and "kicker" entirely (or use null) for concepts where they don't fit.`,
  ].join("\n");
}

function buildBatchUserPrompt(req: CampaignCopyBatchRequest): string {
  const tone = Array.isArray(req.tone) ? req.tone.join(", ") : req.tone;
  const lines: string[] = [
    `Marketing message: ${req.brief.marketingMessage}`,
    `Campaign goal: ${req.brief.campaignGoal}`,
    `Tone: ${tone}`,
  ];
  if (req.brief.targetAudience) lines.push(`Target audience: ${req.brief.targetAudience}`);
  if (req.brief.notes) lines.push(`Additional notes: ${req.brief.notes}`);
  if (req.complianceNotes) lines.push(`Compliance guidance: ${req.complianceNotes}`);
  lines.push(``);
  lines.push(`Concepts (${req.concepts.length}):`);
  for (let i = 0; i < req.concepts.length; i++) {
    const c = req.concepts[i];
    const pieces: string[] = [`conceptId="${c.conceptId}"`];
    if (c.name) pieces.push(`name="${c.name}"`);
    if (c.strategicIdea) pieces.push(`strategic_idea="${c.strategicIdea}"`);
    if (c.targetEmotion) pieces.push(`target_emotion="${c.targetEmotion}"`);
    if (c.tone) {
      const t = Array.isArray(c.tone) ? c.tone.join("/") : c.tone;
      pieces.push(`concept_tone="${t}"`);
    }
    if (c.composition) pieces.push(`composition="${c.composition}"`);
    if (c.moodKeywords && c.moodKeywords.length > 0) {
      pieces.push(`mood="${c.moodKeywords.join(", ")}"`);
    }
    lines.push(`  ${i + 1}. ${pieces.join(" | ")}`);
  }
  return lines.join("\n");
}

interface RawBatchConceptFromModel {
  conceptId: string;
  headline: string;
  subheadline: string;
  body?: string;
  cta: string;
  disclaimer: string;
  // Optional accents — see buildBatchSystemPrompt for the contract.
  eyebrow?: string;
  kicker?: string;
}

function parseBatchModelJson(
  content: string,
  expectedIds: string[],
): RawBatchConceptFromModel[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error("Model returned non-JSON content for batch campaign copy.");
  }
  if (!parsed || typeof parsed !== "object") {
    throw new Error("Model returned a non-object JSON value.");
  }
  const arr = (parsed as { concepts?: unknown }).concepts;
  if (!Array.isArray(arr)) {
    throw new Error('Model output is missing the "concepts" array.');
  }
  if (arr.length !== expectedIds.length) {
    throw new Error(
      `Model returned ${arr.length} concepts but ${expectedIds.length} were requested.`,
    );
  }
  const requiredFields: ReadonlyArray<keyof RawBatchConceptFromModel> = [
    "conceptId",
    "headline",
    "subheadline",
    "cta",
    "disclaimer",
  ];
  const out: RawBatchConceptFromModel[] = [];
  for (let i = 0; i < arr.length; i++) {
    const o = arr[i];
    if (!o || typeof o !== "object") {
      throw new Error(`Model output concept[${i}] is not an object.`);
    }
    const obj = o as Record<string, unknown>;
    for (const k of requiredFields) {
      const v = obj[k];
      if (typeof v !== "string" || v.trim() === "") {
        throw new Error(`Model output concept[${i}] missing required field "${k}".`);
      }
    }
    const item: RawBatchConceptFromModel = {
      conceptId: (obj.conceptId as string).trim(),
      headline: (obj.headline as string).trim(),
      subheadline: (obj.subheadline as string).trim(),
      cta: (obj.cta as string).trim(),
      disclaimer: (obj.disclaimer as string).trim(),
    };
    if (typeof obj.body === "string" && obj.body.trim() !== "") {
      item.body = obj.body.trim();
    }
    // Optional accent fields — accept when the model produced them and
    // they meet basic length / non-empty checks. Out-of-spec values
    // (too long, etc.) are silently dropped rather than rejecting the
    // whole concept.
    if (typeof obj.eyebrow === "string") {
      const e = obj.eyebrow.trim();
      if (e.length > 0 && e.length <= 60) item.eyebrow = e;
    }
    if (typeof obj.kicker === "string") {
      const k = obj.kicker.trim();
      if (k.length > 0 && k.length <= 160) item.kicker = k;
    }
    out.push(item);
  }
  // Verify every expected id is present (order-independent).
  const got = new Set(out.map((c) => c.conceptId));
  const missing = expectedIds.filter((id) => !got.has(id));
  if (missing.length > 0) {
    throw new Error(
      `Model output missing conceptIds: ${missing.join(", ")}.`,
    );
  }
  return out;
}

async function aggregateBatchComplianceNotes(
  concept: RawBatchConceptFromModel,
  locale: LocaleCode,
): Promise<string[]> {
  const fields: Array<{ label: string; text: string }> = [
    { label: "headline", text: concept.headline },
    { label: "subheadline", text: concept.subheadline },
    { label: "cta", text: concept.cta },
    { label: "disclaimer", text: concept.disclaimer },
  ];
  if (concept.body) fields.push({ label: "body", text: concept.body });
  // Optional accents — when present, they are rendered text on the banner
  // so they must pass through the same compliance check as the rest.
  if (concept.eyebrow) fields.push({ label: "eyebrow", text: concept.eyebrow });
  if (concept.kicker) fields.push({ label: "kicker", text: concept.kicker });

  const results = await Promise.all(
    fields.map(async (f) => {
      try {
        const r = await validateCompliance(f.text, locale);
        return { label: f.label, ...r };
      } catch {
        return null;
      }
    }),
  );

  // See aggregateComplianceNotes: `suggestions` is just `issues` with an
  // "Address: " prefix — emitting both doubles the noise. Issues only.
  const notes: string[] = [];
  for (const r of results) {
    if (!r) continue;
    for (const issue of r.issues ?? []) notes.push(`[${r.label}] ${issue}`);
  }
  return notes;
}

export async function generateCampaignCopyBatch(
  req: CampaignCopyBatchRequest,
): Promise<CampaignCopyBatchResponse> {
  if (!SUPPORTED_LOCALES.includes(req.targetLocale)) {
    throw new UnsupportedLocaleError(req.targetLocale);
  }
  if (!Array.isArray(req.concepts) || req.concepts.length === 0) {
    throw new Error("Batch request must include at least one concept.");
  }

  const riskWarningRequired = req.riskWarningRequired ?? true;
  const expectedIds = req.concepts.map((c) => c.conceptId);

  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildBatchSystemPrompt(
          req.targetLocale,
          req.concepts.length,
          riskWarningRequired,
        ),
      },
      { role: "user", content: buildBatchUserPrompt(req) },
    ],
  });
  const content = extractTranslation(completion);
  const rawConcepts = parseBatchModelJson(content, expectedIds);

  // Compliance validation per concept, all concepts in parallel.
  const results: CampaignCopyBatchConceptResult[] = await Promise.all(
    rawConcepts.map(async (c) => {
      const notes = await aggregateBatchComplianceNotes(c, req.targetLocale);
      const tag = `batch ${c.conceptId}`;
      return {
        conceptId: c.conceptId,
        headline: rewriteString(c.headline, req.targetLocale, tag)!,
        subheadline: rewriteString(c.subheadline, req.targetLocale, tag)!,
        body: rewriteString(c.body, req.targetLocale, tag),
        cta: rewriteString(c.cta, req.targetLocale, tag)!,
        disclaimer: rewriteString(c.disclaimer, req.targetLocale, tag)!,
        eyebrow: rewriteString(c.eyebrow, req.targetLocale, tag),
        kicker: rewriteString(c.kicker, req.targetLocale, tag),
        complianceNotes: notes,
      };
    }),
  );

  return {
    locale: req.targetLocale,
    direction: localeDirection(req.targetLocale),
    concepts: results,
  };
}

export async function generateCampaignCopy(
  req: CampaignCopyRequest,
): Promise<CampaignCopyResponse> {
  if (!SUPPORTED_LOCALES.includes(req.targetLocale)) {
    throw new UnsupportedLocaleError(req.targetLocale);
  }

  const riskWarningRequired = req.riskWarningRequired ?? true;
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.7,
    response_format: { type: "json_object" },
    messages: [
      { role: "system", content: buildSystemPrompt(req.targetLocale, riskWarningRequired) },
      { role: "user", content: buildUserPrompt(req) },
    ],
  });
  const content = extractTranslation(completion);
  const copy = parseModelJson(content);
  const complianceNotes = await aggregateComplianceNotes(copy, req.targetLocale);

  const tag = "single";
  return {
    locale: req.targetLocale,
    direction: localeDirection(req.targetLocale),
    headline: rewriteString(copy.headline, req.targetLocale, tag)!,
    subheadline: rewriteString(copy.subheadline, req.targetLocale, tag)!,
    body: rewriteString(copy.body, req.targetLocale, tag),
    cta: rewriteString(copy.cta, req.targetLocale, tag)!,
    disclaimer: rewriteString(copy.disclaimer, req.targetLocale, tag)!,
    complianceNotes,
  };
}

// ── By-message generator ────────────────────────────────────────────────────
//
// One marketing message → N concept variants. Each banner field is generated
// in its own focused OpenAI call with a textType-appropriate prompt + length
// budget. The batch generator (generateCampaignCopyBatch above) sends ONE
// prompt for all fields × all concepts together — fast and coherent, but
// each field shares attention. This generator does the opposite: cost ↑,
// per-field quality ↑, length awareness per textType convention ↑↑.
//
// Compliance and disclaimer rules apply identically.

type BannerFieldKey =
  | "headline"
  | "subheadline"
  | "body"
  | "cta"
  | "disclaimer"
  | "eyebrow"
  | "kicker";

// Each banner field maps to a platform-conventional textType. The label is
// used in the prompt; the length comes from TEXT_TYPE_DEFAULT_MAX_CHARS in
// services/ai.ts (kept in sync there). When a field is "skippable" the
// model may legitimately return empty for some concepts (eyebrow/kicker).
interface FieldSpec {
  key: BannerFieldKey;
  textTypeLabel: string;
  maxChars: number;
  required: boolean;
  prompt: string;
}

function fieldSpecs(): FieldSpec[] {
  return [
    {
      key: "headline",
      textTypeLabel: "landing_headline",
      maxChars: 60,
      required: true,
      prompt:
        "Write a calm, concrete ad headline — ≤ 60 chars, brand-first, one short clause. Prefer platform / market-access language. No periods unless declarative.",
    },
    {
      key: "subheadline",
      textTypeLabel: "meta_primary_text",
      maxChars: 120,
      required: true,
      prompt:
        "Write a supporting line — ≤ 120 chars, one specific platform or market-access value proposition. No hype.",
    },
    {
      key: "body",
      textTypeLabel: "email_body",
      maxChars: 280,
      required: false,
      prompt:
        "OPTIONAL — when included, a short supporting paragraph ≤ 280 chars that expands the value prop. Omit if natural.",
    },
    {
      key: "cta",
      textTypeLabel: "cta_button",
      maxChars: 24,
      required: true,
      prompt:
        "A single neutral action-verb phrase, ≤ 24 chars (e.g. 'Explore Platform', 'Compare Markets', 'View Tools'). Tense: imperative. Avoid vague words like options/strategy/insights unless explicitly requested.",
    },
    {
      key: "disclaimer",
      textTypeLabel: "banner (regulator footer)",
      maxChars: 200,
      required: true,
      prompt:
        "Regulator-appropriate risk warning, factual and neutral. No urgency, no superlatives, no guarantees.",
    },
    {
      key: "eyebrow",
      textTypeLabel: "ALL-CAPS category label",
      maxChars: 40,
      required: false,
      prompt:
        "OPTIONAL — a short ALL-CAPS category label ≤ 40 chars (e.g. 'ETF TRADING', 'PROFESSIONAL PLATFORM'). NEVER include numeric / dollar / percent claims. Omit when not a natural fit.",
    },
    {
      key: "kicker",
      textTypeLabel: "pull-quote line",
      maxChars: 120,
      required: false,
      prompt:
        "OPTIONAL — a short pull-quote style line ≤ 120 chars. Omit when not a natural fit.",
    },
  ];
}

function buildFieldSystemPrompt(
  spec: FieldSpec,
  locale: LocaleCode,
  conceptCount: number,
  riskWarningRequired: boolean,
): string {
  const language = localeLanguageLabel(locale);
  const riskClause = riskWarningRequired
    ? "If this is the disclaimer field, include a regulator-appropriate risk warning."
    : "";
  const distinctnessClause =
    conceptCount > 1
      ? `Produce ${conceptCount} DISTINCT variants. Each must use noticeably different vocabulary, syntax, and angle — they will become 3 separate ad concepts side-by-side.`
      : `Produce 1 variant.`;
  return [
    `You write localized financial-marketing ad copy in ${language}.`,
    `You are producing variants of ONE banner field: "${spec.key}" (textType = ${spec.textTypeLabel}, max ${spec.maxChars} chars).`,
    `${spec.prompt}`,
    `Tone must be professional, factual, EU regulator-compliant. Avoid guarantees, urgency, superlatives, oversimplification.`,
    riskClause,
    distinctnessClause,
    ``,
    `Return STRICT JSON only, no prose: { "variants": ["…", "…", …] }`,
    `Use ${language} for every variant. Output ${conceptCount} array entries.`,
    spec.required
      ? `Every entry must be a non-empty string.`
      : `For entries where the accent doesn't naturally fit, use an empty string "" — never null.`,
  ]
    .filter((l) => l !== "")
    .join("\n");
}

function buildFieldUserPrompt(
  req: CampaignCopyByMessageRequest,
  spec: FieldSpec,
): string {
  const tone = Array.isArray(req.tone) ? req.tone.join(", ") : req.tone;
  const lines: string[] = [
    `Marketing message: ${req.brief.marketingMessage}`,
    `Campaign goal: ${req.brief.campaignGoal}`,
    `Persona: ${req.persona}`,
    `Tone: ${tone}`,
  ];
  if (req.brief.targetAudience) lines.push(`Target audience: ${req.brief.targetAudience}`);
  if (req.brief.notes) lines.push(`Notes: ${req.brief.notes}`);
  if (req.complianceNotes) lines.push(`Compliance guidance: ${req.complianceNotes}`);
  lines.push(``);
  lines.push(`Generate the "${spec.key}" variants now as JSON.`);
  return lines.join("\n");
}

async function generateFieldVariants(
  req: CampaignCopyByMessageRequest,
  spec: FieldSpec,
): Promise<string[]> {
  const conceptCount = req.conceptCount ?? 3;
  const riskWarningRequired = req.riskWarningRequired ?? true;
  const completion = await openai.chat.completions.create({
    model: MODEL,
    temperature: 0.75,
    response_format: { type: "json_object" },
    messages: [
      {
        role: "system",
        content: buildFieldSystemPrompt(spec, req.targetLocale, conceptCount, riskWarningRequired),
      },
      { role: "user", content: buildFieldUserPrompt(req, spec) },
    ],
  });
  const content = extractTranslation(completion);
  let parsed: unknown;
  try {
    parsed = JSON.parse(content);
  } catch {
    throw new Error(`by-message: non-JSON for field "${spec.key}"`);
  }
  const arr = (parsed as { variants?: unknown }).variants;
  if (!Array.isArray(arr) || arr.length !== conceptCount) {
    throw new Error(
      `by-message: field "${spec.key}" returned ${Array.isArray(arr) ? arr.length : "non-array"}, expected ${conceptCount}`,
    );
  }
  const out: string[] = [];
  for (let i = 0; i < arr.length; i++) {
    const v = arr[i];
    if (typeof v !== "string") {
      if (spec.required) {
        throw new Error(`by-message: field "${spec.key}" variant ${i} is not a string`);
      }
      out.push("");
      continue;
    }
    out.push(v.trim());
  }
  // Validate required fields produced non-empty content
  if (spec.required && out.some((s) => s.length === 0)) {
    throw new Error(`by-message: required field "${spec.key}" returned an empty variant`);
  }
  return out;
}

export async function generateCampaignCopyByMessage(
  req: CampaignCopyByMessageRequest,
): Promise<CampaignCopyByMessageResponse> {
  if (!SUPPORTED_LOCALES.includes(req.targetLocale)) {
    throw new UnsupportedLocaleError(req.targetLocale);
  }
  const conceptCount = req.conceptCount ?? 3;
  if (conceptCount < 1 || conceptCount > 5) {
    throw new Error("by-message: conceptCount must be 1..5");
  }

  // Generate every banner field in parallel — one OpenAI call per field,
  // each returning `conceptCount` variants. Total: 7 calls per campaign.
  const specs = fieldSpecs();
  const fieldResults = await Promise.all(
    specs.map(async (spec) => {
      try {
        const variants = await generateFieldVariants(req, spec);
        return { key: spec.key, variants };
      } catch (err) {
        if (spec.required) throw err;
        // Optional field — log and skip rather than failing the whole call
        return { key: spec.key, variants: new Array(conceptCount).fill("") };
      }
    }),
  );

  // Zip variants[i] from each field into the i-th concept.
  const byKey = new Map(fieldResults.map((r) => [r.key, r.variants]));
  const concepts: CampaignCopyBatchConceptResult[] = [];
  for (let i = 0; i < conceptCount; i++) {
    const conceptId = `concept_${i + 1}`;
    const headline = byKey.get("headline")![i];
    const subheadline = byKey.get("subheadline")![i];
    const body = byKey.get("body")![i];
    const cta = byKey.get("cta")![i];
    const disclaimer = byKey.get("disclaimer")![i];
    const eyebrow = byKey.get("eyebrow")![i];
    const kicker = byKey.get("kicker")![i];

    // Compliance per non-empty text field, parallel within a concept.
    const raw: RawBatchConceptFromModel = {
      conceptId,
      headline,
      subheadline,
      cta,
      disclaimer,
    };
    if (body) raw.body = body;
    if (eyebrow) raw.eyebrow = eyebrow;
    if (kicker) raw.kicker = kicker;
    const complianceNotes = await aggregateBatchComplianceNotes(raw, req.targetLocale);

    const tag = `by-message ${conceptId}`;
    concepts.push({
      conceptId,
      headline: rewriteString(headline, req.targetLocale, tag)!,
      subheadline: rewriteString(subheadline, req.targetLocale, tag)!,
      body: rewriteString(body || undefined, req.targetLocale, tag),
      cta: rewriteString(cta, req.targetLocale, tag)!,
      disclaimer: rewriteString(disclaimer, req.targetLocale, tag)!,
      complianceNotes,
      eyebrow: rewriteString(eyebrow || undefined, req.targetLocale, tag),
      kicker: rewriteString(kicker || undefined, req.targetLocale, tag),
    });
  }

  return {
    locale: req.targetLocale,
    direction: localeDirection(req.targetLocale),
    concepts,
  };
}
