import { LengthConstraint } from "@mexem/shared";

export function countWords(text: string): number {
  return text.trim().split(/\s+/).filter(Boolean).length;
}

export function validateLength(text: string, constraint: LengthConstraint) {
  const chars = text.length;
  const words = countWords(text);
  const results: Record<string, unknown> = { chars, words };

  // withinLimit is false only when a configured constraint is actively violated.
  // This is the field the frontend uses for the "Length exceeded" badge.
  let withinLimit = true;

  if (constraint.mode === "exact" && typeof constraint.exactChars === "number") {
    const exact = chars === constraint.exactChars;
    results.exact = exact;
    if (!exact) withinLimit = false;
  }

  if (constraint.mode === "near" && typeof constraint.exactChars === "number") {
    const delta = Math.abs(chars - constraint.exactChars);
    const near = delta <= 10;
    results.near = near;
    results.delta = delta;
    if (!near) withinLimit = false;
  }

  if (constraint.mode === "max" && typeof constraint.maxChars === "number") {
    const ok = chars <= constraint.maxChars;
    results.maxChars = ok;
    if (!ok) withinLimit = false;
  }

  if (constraint.mode === "max" && typeof constraint.maxWords === "number") {
    const ok = words <= constraint.maxWords;
    results.maxWords = ok;
    if (!ok) withinLimit = false;
  }

  if (constraint.mode === "range") {
    if (typeof constraint.minChars === "number" && typeof constraint.maxCharsRange === "number") {
      const ok = chars >= constraint.minChars && chars <= constraint.maxCharsRange;
      results.rangeChars = ok;
      if (!ok) withinLimit = false;
    }
    if (typeof constraint.minWords === "number" && typeof constraint.maxWordsRange === "number") {
      const ok = words >= constraint.minWords && words <= constraint.maxWordsRange;
      results.rangeWords = ok;
      if (!ok) withinLimit = false;
    }
  }

  results.withinLimit = withinLimit;
  return results;
}
