/**
 * Shared helpers for OpenAI chat-completion handling.
 *
 * - extractTranslation: enforce that the translation pipeline never silently
 *   returns the source text as a "successful" translation when the model
 *   returns nothing. Throws EmptyTranslationError on empty/missing content.
 *
 * - EmptyTranslationError: narrow, catchable error type that routes use to
 *   distinguish "model returned empty" (expected, per-cell failure) from any
 *   other error (infra/config/DB/provider network — must bubble).
 *
 * - lazyOpenAI: module-scope OpenAI clients previously crashed at import
 *   when OPENAI_API_KEY was unset (the SDK throws in its constructor). This
 *   factory defers construction until first use, so import order and app
 *   startup are safe even without a key — the request then fails cleanly.
 */

import OpenAI from "openai";
import type { ChatCompletion } from "openai/resources/chat/completions";

export class EmptyTranslationError extends Error {
  constructor(message = "Translation provider returned empty content.") {
    super(message);
    this.name = "EmptyTranslationError";
  }
}

/**
 * Extract the trimmed assistant text from a chat-completion response.
 * Throws EmptyTranslationError if the response is missing, has no choices,
 * or has empty/whitespace-only content. Callers must let this propagate —
 * never fall back to the source text.
 */
export function extractTranslation(response: ChatCompletion | null | undefined): string {
  const content = response?.choices?.[0]?.message?.content?.trim();
  if (!content) {
    throw new EmptyTranslationError();
  }
  return content;
}

/**
 * Lazy OpenAI client. The SDK constructor throws when apiKey is undefined;
 * returning a Proxy defers that until first use so a missing key doesn't
 * crash module import. Call sites use this exactly like a normal client.
 */
export function lazyOpenAI(timeoutMs?: number): OpenAI {
  let client: OpenAI | null = null;
  const init = (): OpenAI => {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error("OPENAI_API_KEY is required for translation.");
    }
    const opts: ConstructorParameters<typeof OpenAI>[0] = { apiKey };
    if (timeoutMs !== undefined) opts.timeout = timeoutMs;
    const mrRaw = process.env.OPENAI_MAX_RETRIES;
    if (mrRaw !== undefined && mrRaw !== "") {
      const mr = Number(mrRaw);
      if (!Number.isNaN(mr)) opts.maxRetries = mr;
    }
    return new OpenAI(opts);
  };
  return new Proxy({} as OpenAI, {
    get(_target, prop) {
      if (!client) client = init();
      return (client as any)[prop];
    },
  });
}
