/**
 * Map a thrown error from a translate route to an HTTP response payload.
 *
 * The translate routes (`/api/translate`, `/api/batch`, `/api/translate/quick`)
 * all sit in front of the OpenAI SDK. Their previous catch-alls collapsed
 * every failure into a generic `500 "Translation failed."`, which made
 * diagnosing post-deploy issues painful — operators couldn't tell whether
 * the key was missing, rejected, rate-limited, or whether the upstream just
 * blipped. This helper extracts a known-safe class of error and returns an
 * informative status + `code`. Anything unrecognised still falls through
 * to a generic 500 — we never leak stack traces or unredacted text.
 */

export type TranslateErrorPayload = {
  status: number;
  body: { error: string; code?: string; upstreamStatus?: number };
};

export function mapTranslateError(err: unknown, fallback: string): TranslateErrorPayload {
  const msg = typeof (err as { message?: unknown })?.message === "string"
    ? (err as { message: string }).message
    : "";

  // Config error — the key isn't set or got an empty value.
  if (msg.includes("OPENAI_API_KEY")) {
    return {
      status: 503,
      body: { error: "OpenAI is not configured on the server.", code: "openai_unconfigured" },
    };
  }

  // OpenAI SDK throws errors with a numeric `status` property.
  const upstreamStatus = (err as { status?: unknown })?.status;
  if (typeof upstreamStatus === "number") {
    if (upstreamStatus === 401) {
      return {
        status: 502,
        body: { error: "OpenAI rejected the request (401). Check OPENAI_API_KEY.", code: "openai_auth", upstreamStatus },
      };
    }
    if (upstreamStatus === 429) {
      return {
        status: 429,
        body: { error: "OpenAI rate limit reached. Try again in a moment.", code: "openai_rate_limit", upstreamStatus },
      };
    }
    if (upstreamStatus >= 500) {
      return {
        status: 502,
        body: { error: "OpenAI upstream error.", code: "openai_upstream", upstreamStatus },
      };
    }
  }

  // Network-level failures from the SDK use error codes like ECONNRESET / ETIMEDOUT.
  const sdkCode = (err as { code?: unknown })?.code;
  if (sdkCode === "ETIMEDOUT" || sdkCode === "ESOCKETTIMEDOUT" || msg.toLowerCase().includes("timeout")) {
    return {
      status: 504,
      body: { error: "OpenAI request timed out.", code: "openai_timeout" },
    };
  }

  return { status: 500, body: { error: fallback } };
}
