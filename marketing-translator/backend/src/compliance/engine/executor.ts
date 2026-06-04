/**
 * Bundle Rule Executor.
 *
 * Runs the deterministic (non-LLM) rules in a published bundle against text.
 * Returns matched issues with evidence and source references.
 *
 * This is a pure function — no I/O, no DB reads.
 */

import type { RuleBundleContent, ObligationSeverity, SourceRef } from "@mexem/shared";
import type { LoadedBundle } from "../bundles/loader";

export interface BundleRuleMatch {
  ruleType: "banned_phrase" | "regex" | "required_disclaimer";
  severity: ObligationSeverity;
  message: string;
  /** The text fragment that matched. */
  evidence?: string;
}

export interface BundleExecutionResult {
  matches: BundleRuleMatch[];
  passed: boolean;
  /** The bundle that was evaluated. */
  bundleVersion: string;
  sourceRefs: SourceRef[];
}

/**
 * Run all deterministic rules in a bundle against the given text.
 */
export function executeBundleRules(text: string, bundle: LoadedBundle): BundleExecutionResult {
  const matches: BundleRuleMatch[] = [];
  const content = bundle.content;
  const lowerText = text.toLowerCase();

  // ── Banned phrases ─────────────────────────────────────────────────
  for (const phrase of content.bannedPhrases) {
    const lowerPhrase = phrase.toLowerCase();
    if (lowerText.includes(lowerPhrase)) {
      matches.push({
        ruleType: "banned_phrase",
        severity: "critical",
        message: `Banned phrase detected: "${phrase}"`,
        evidence: phrase,
      });
    }
  }

  // ── Regex rules ────────────────────────────────────────────────────
  for (const rule of content.regexRules) {
    try {
      const regex = new RegExp(rule.pattern, rule.flags ?? "gi");
      const match = text.match(regex);
      if (match) {
        matches.push({
          ruleType: "regex",
          severity: rule.severity,
          message: rule.message ?? `Regex match: ${rule.pattern}`,
          evidence: match[0],
        });
      }
    } catch {
      // Invalid regex in bundle — skip (should have been caught at compile time)
    }
  }

  // ── Required disclaimers ───────────────────────────────────────────
  // If any trigger word is present, the disclaimer text must also appear
  for (const disc of content.requiredDisclaimers) {
    const triggers = disc.triggers ?? [];
    const hasAnyTrigger = triggers.length === 0 || triggers.some(t =>
      lowerText.includes(t.toLowerCase())
    );
    if (hasAnyTrigger) {
      const disclaimerPresent = lowerText.includes(disc.text.toLowerCase());
      if (!disclaimerPresent) {
        matches.push({
          ruleType: "required_disclaimer",
          severity: "major",
          message: `Required disclaimer missing: "${disc.text.substring(0, 80)}…"`,
        });
      }
    }
  }

  const hasCritical = matches.some(m => m.severity === "critical");
  return {
    matches,
    passed: matches.length === 0,
    bundleVersion: `${bundle.localeCode}@${bundle.version}`,
    sourceRefs: bundle.sourceRefs,
  };
}
