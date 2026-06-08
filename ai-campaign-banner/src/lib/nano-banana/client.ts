// Gemini 2.5 Flash Image ("Nano Banana") client.
//
// Generates a single image from a text prompt via Google's
// generativelanguage.googleapis.com endpoint. Returns the raw base64 PNG +
// mime type — callers are responsible for writing it to disk.
//
// Reads GEMINI_API_KEY from env. Throws a typed config error if missing so
// the API route can return a clean 503 rather than a stack trace.

// "Nano Banana" — Gemini 2.5 Flash Image (stable, GA). Override with
// GEMINI_IMAGE_MODEL to swap to a newer image-capable model like
// `gemini-3-pro-image` or `gemini-3.1-flash-image`. List them via:
//   curl "https://generativelanguage.googleapis.com/v1beta/models?key=$GEMINI_API_KEY"
const DEFAULT_MODEL = "gemini-2.5-flash-image";

function endpointFor(model: string): string {
  return `https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`;
}

export class NanoBananaConfigError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NanoBananaConfigError";
  }
}

export class NanoBananaError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "NanoBananaError";
  }
}

export interface NanoBananaImage {
  imageBase64: string;
  mimeType: string;
}

// Translate Google's verbose JSON 429s into a one-line actionable message.
// The most common case for us is `limit: 0` on the free tier — meaning the
// model is paid-only on this project. We surface that exact diagnosis with
// the URL to enable billing.
function humanizeApiError(model: string, status: number, detail: string): string {
  if (status === 429) {
    const limitZero = /limit:\s*0(?!\d)/.test(detail);
    if (limitZero) {
      return (
        `Gemini image generation is paid-only on this Google Cloud project ` +
        `(quota for ${model} = 0 on the free tier). ` +
        `Enable billing at https://aistudio.google.com/app/apikey ` +
        `→ pick the project → Set up Billing. After billing is on, retry.`
      );
    }
    return (
      `Gemini rate limit hit for ${model}. ` +
      `Either wait for the per-minute window to reset (~60s) or enable a higher quota tier. ` +
      `Detail: ${detail.slice(0, 200)}`
    );
  }
  return `Nano Banana (${model}) failed (${status}): ${detail.slice(0, 400)}`;
}

// Aspect ratios Gemini 2.5 Flash Image accepts via imageConfig.aspectRatio.
// Anything else and the API silently returns the default 1024×1024 square.
export type GeminiAspectRatio = "1:1" | "16:9" | "9:16" | "4:3" | "3:4";

export interface GenerateOptions {
  apiKey?: string;
  model?: string;
  aspectRatio?: GeminiAspectRatio;
  signal?: AbortSignal;
  timeoutMs?: number;
}

export async function generateImage(
  prompt: string,
  opts: GenerateOptions = {},
): Promise<NanoBananaImage> {
  const apiKey = opts.apiKey ?? process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new NanoBananaConfigError(
      "GEMINI_API_KEY is required. Set it in .env.local (Google AI Studio key for the Gemini 2.5 Flash Image model).",
    );
  }
  const model = opts.model ?? process.env.GEMINI_IMAGE_MODEL ?? DEFAULT_MODEL;

  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    opts.timeoutMs ?? 60_000,
  );
  if (opts.signal) {
    opts.signal.addEventListener("abort", () => controller.abort());
  }

  let res: Response;
  try {
    res = await fetch(`${endpointFor(model)}?key=${apiKey}`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        contents: [{ parts: [{ text: prompt }] }],
        generationConfig: {
          responseModalities: ["IMAGE"],
          ...(opts.aspectRatio
            ? { imageConfig: { aspectRatio: opts.aspectRatio } }
            : {}),
        },
      }),
      signal: controller.signal,
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const detail = await res.text().catch(() => "");
    throw new NanoBananaError(humanizeApiError(model, res.status, detail));
  }

  const data = await res.json();
  const part = data?.candidates?.[0]?.content?.parts?.find(
    (p: { inlineData?: { data?: string; mimeType?: string } }) => p?.inlineData?.data,
  );
  if (!part?.inlineData?.data) {
    throw new NanoBananaError(
      `Nano Banana returned no image data. Raw response: ${JSON.stringify(data).slice(0, 400)}`,
    );
  }

  return {
    imageBase64: part.inlineData.data,
    mimeType: part.inlineData.mimeType ?? "image/png",
  };
}
