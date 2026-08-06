/**
 * Server-side HTTP client for marketing-translator's /api/campaign-copy.
 *
 * marketing-translator is the single source of campaign / ad copy.
 * ai-campaign-banner does NOT generate headline / subheadline / cta /
 * disclaimer locally; it calls this client and writes the result into
 * each concept's copy_package before manifest construction.
 *
 * Auth: sends `Authorization: Bearer ${MARKETING_TRANSLATOR_API_KEY}`.
 * The translator side accepts that as a static service-to-service token
 * via its CAMPAIGN_COPY_API_KEY.
 *
 * Mock fallback:
 *   Disabled unless the operator explicitly sets
 *   MARKETING_TRANSLATOR_ALLOW_MOCK=1. Missing MARKETING_TRANSLATOR_API_URL is
 *   otherwise a hard error, including local dev, so campaign text cannot
 *   silently come from a local fallback.
 */

import {
  CampaignCopyBatchRequestSchema,
  CampaignCopyRequestSchema,
  LocalizedCopyBatchResponseSchema,
  LocalizedCopyPackageSchema,
  type CampaignCopyBatchRequest,
  type CampaignCopyRequest,
  type LocalizedCopyBatchResponse,
  type LocalizedCopyPackage,
} from "@/lib/marketing-translator/schema";
import {
  mockCampaignCopy,
  mockCampaignCopyBatch,
} from "@/lib/marketing-translator/mock";

export interface FetchCampaignCopyOptions {
  signal?: AbortSignal;
  /** Override the URL/key (tests). Otherwise read from env. */
  baseUrl?: string;
  apiKey?: string;
}

export class MarketingTranslatorError extends Error {
  status: number;
  /** Parsed structured error body when the translator returned JSON (e.g. the
   *  compliance_failed 422 payload). Undefined for plain-text errors. */
  body?: unknown;
  constructor(status: number, message: string, body?: unknown) {
    super(message);
    this.status = status;
    this.body = body;
    this.name = "MarketingTranslatorError";
  }
}

/**
 * Turn a non-2xx translator response into a structured error. The fail-closed
 * compliance path returns 422 with { error:"compliance_failed", blockedFields }
 * — we surface a readable summary so the banner never silently proceeds and an
 * operator can see which fields blocked generation.
 */
async function errorFromResponse(res: Response): Promise<MarketingTranslatorError> {
  const raw = await res.text().catch(() => "");
  let body: unknown;
  try {
    body = raw ? JSON.parse(raw) : undefined;
  } catch {
    body = undefined;
  }
  const b = body as
    | { error?: string; message?: string; blockedFields?: Array<{ conceptId?: string; field?: string; finalAction?: string }> }
    | undefined;
  if (res.status === 422 && b?.error === "compliance_failed") {
    const fields = (b.blockedFields ?? [])
      .map((f) => `${f.conceptId ? `${f.conceptId}.` : ""}${f.field}=${f.finalAction}`)
      .join(", ");
    return new MarketingTranslatorError(
      422,
      `marketing-translator blocked copy on compliance: ${fields || b.message || "unknown"}`,
      body,
    );
  }
  return new MarketingTranslatorError(
    res.status,
    `marketing-translator ${res.status}: ${redact(raw).slice(0, 500)}`,
    body,
  );
}

export class MarketingTranslatorConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "MarketingTranslatorConfigError";
  }
}

export async function fetchCampaignCopy(
  request: CampaignCopyRequest,
  opts: FetchCampaignCopyOptions = {},
): Promise<LocalizedCopyPackage> {
  const validated = CampaignCopyRequestSchema.parse(request);
  const baseUrl = opts.baseUrl ?? process.env.MARKETING_TRANSLATOR_API_URL;
  const apiKey = opts.apiKey ?? process.env.MARKETING_TRANSLATOR_API_KEY;

  if (!baseUrl) {
    const allowMock = process.env.MARKETING_TRANSLATOR_ALLOW_MOCK === "1";
    if (!allowMock) {
      throw new MarketingTranslatorConfigError(
        "MARKETING_TRANSLATOR_API_URL is required. " +
          "Set the env var to the translator service URL, or (for an " +
          "intentional staging dry-run only) set " +
          "MARKETING_TRANSLATOR_ALLOW_MOCK=1 to re-enable the local mock.",
      );
    }
    return mockCampaignCopy(validated);
  }

  const url = new URL("/api/campaign-copy", baseUrl).toString();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(validated),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw await errorFromResponse(res);
  }

  const json = (await res.json()) as unknown;
  const parsed = LocalizedCopyPackageSchema.safeParse(json);
  if (!parsed.success) {
    throw new MarketingTranslatorError(
      502,
      `marketing-translator response failed schema: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

export async function fetchCampaignCopyBatch(
  request: CampaignCopyBatchRequest,
  opts: FetchCampaignCopyOptions = {},
): Promise<LocalizedCopyBatchResponse> {
  const validated = CampaignCopyBatchRequestSchema.parse(request);
  const baseUrl = opts.baseUrl ?? process.env.MARKETING_TRANSLATOR_API_URL;
  const apiKey = opts.apiKey ?? process.env.MARKETING_TRANSLATOR_API_KEY;

  if (!baseUrl) {
    const allowMock = process.env.MARKETING_TRANSLATOR_ALLOW_MOCK === "1";
    if (!allowMock) {
      throw new MarketingTranslatorConfigError(
        "MARKETING_TRANSLATOR_API_URL is required. " +
          "Set the env var to the translator service URL, or (for an " +
          "intentional staging dry-run only) set " +
          "MARKETING_TRANSLATOR_ALLOW_MOCK=1 to re-enable the local mock.",
      );
    }
    return mockCampaignCopyBatch(validated);
  }

  const url = new URL("/api/campaign-copy/batch", baseUrl).toString();
  const headers: Record<string, string> = {
    "content-type": "application/json",
    accept: "application/json",
  };
  if (apiKey) headers.authorization = `Bearer ${apiKey}`;

  const res = await fetch(url, {
    method: "POST",
    headers,
    body: JSON.stringify(validated),
    signal: opts.signal,
  });

  if (!res.ok) {
    throw await errorFromResponse(res);
  }

  const json = (await res.json()) as unknown;
  const parsed = LocalizedCopyBatchResponseSchema.safeParse(json);
  if (!parsed.success) {
    throw new MarketingTranslatorError(
      502,
      `marketing-translator batch response failed schema: ${parsed.error.issues
        .map((i) => `${i.path.join(".")}: ${i.message}`)
        .join("; ")}`,
    );
  }
  return parsed.data;
}

function redact(s: string): string {
  return s
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .replace(/sk-[A-Za-z0-9._-]{8,}/g, "sk-[redacted]");
}
