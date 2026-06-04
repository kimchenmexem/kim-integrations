/**
 * RuleBundle compiler.
 *
 * Gathers approved obligations + enabled rules for a locale and a set of
 * jurisdictions, and compiles them into a RuleBundleContent blob ready
 * for publishing.
 *
 * Composition model (layered):
 *   national primary  +  EU baseline (implicit for EU-member locales)  +  optional overlays
 *
 * EU obligations exist ONCE with jurisdiction="EU" and localeCode=null.
 * They are reusable across every EU-member locale bundle via the
 * jurisdiction IN (...) query below — never duplicated per locale.
 *
 * The compiler NEVER reads raw SourceDocumentVersion content.
 * It reads only ComplianceObligation + ComplianceRule records.
 */

import crypto from "crypto";
import { prisma, type DbClient } from "../../db";
import type { RuleBundleContent, SourceRef, ObligationSeverity } from "@mexem/shared";

function safeParse<T>(s: string | null | undefined, fallback: T): T {
  if (!s) return fallback;
  try { return JSON.parse(s) as T; } catch { return fallback; }
}

/**
 * Jurisdictions that get the EU baseline layered in automatically.
 * GB is intentionally excluded — FCA bundles stay GB-only unless a caller
 * explicitly opts in via `overlays: ["EU"]`.
 */
const EU_MEMBER_JURISDICTIONS = new Set(["IT", "FR", "NL", "BE", "ES", "CY"]);

export interface CompileInput {
  localeCode: string;
  /** @deprecated prefer `jurisdictions`. Single-jurisdiction compiles still work via this field. */
  jurisdiction?: string;
  /** Explicit list of jurisdictions to include, in priority order. First entry is the primary. */
  jurisdictions?: string[];
  /** Additional overlay jurisdictions appended on top of the resolved list. */
  overlays?: string[];
  /** Semantic-only version string like "1.0.0". Must be unique per locale. */
  version: string;
  notes?: string;
  /** Who initiated the compile (for audit). */
  compiledBy?: string;
}

export interface CompileResult {
  bundleId: number;
  localeCode: string;
  /** Primary jurisdiction (first explicit entry the caller passed). */
  jurisdiction: string;
  /** Full resolved composition used by the compiler. */
  jurisdictionsApplied: string[];
  version: string;
  ruleCount: number;
  obligationCount: number;
}

/**
 * Resolve the effective jurisdiction list from the caller's input.
 *
 * Rules:
 *  1. Start from `jurisdictions` (explicit). Fall back to `[jurisdiction]` if absent.
 *  2. If any explicit entry is an EU-member jurisdiction, auto-append "EU".
 *  3. Append `overlays` verbatim.
 *  4. Deduplicate while preserving first-seen order.
 *
 * The first entry after resolution (but taken from the *explicit* list, not
 * the auto-added EU) is the primary jurisdiction stored on the bundle row.
 */
export function resolveJurisdictions(input: CompileInput): {
  all: string[];
  primary: string;
} {
  const explicit = input.jurisdictions && input.jurisdictions.length > 0
    ? input.jurisdictions
    : (input.jurisdiction ? [input.jurisdiction] : []);

  if (explicit.length === 0) {
    throw new Error("compileDraftBundle requires either `jurisdiction` or a non-empty `jurisdictions` array.");
  }

  const primary = explicit[0];
  const result: string[] = [...explicit];

  // Implicit EU baseline: any EU-member jurisdiction in the explicit list pulls in EU.
  const needsEuBaseline = explicit.some((j) => EU_MEMBER_JURISDICTIONS.has(j));
  if (needsEuBaseline && !result.includes("EU")) result.push("EU");

  for (const o of input.overlays ?? []) {
    if (!result.includes(o)) result.push(o);
  }

  return { all: result, primary };
}

/**
 * Compile a draft RuleBundle from approved obligations.
 *
 * Steps:
 *  1. Find all approved obligations matching the locale/jurisdiction.
 *  2. Collect their enabled ComplianceRules.
 *  3. Build RuleBundleContent.
 *  4. Hash the content for integrity.
 *  5. Insert a draft RuleBundle row.
 */
export async function compileDraftBundle(input: CompileInput, db: DbClient = prisma): Promise<CompileResult> {
  // ── 0. Resolve the effective jurisdiction composition ──────────────
  const { all: jurisdictionsApplied, primary } = resolveJurisdictions(input);

  // ── 1. Gather approved obligations across ALL resolved jurisdictions ─
  const obligations = await db.complianceObligation.findMany({
    where: {
      status: "approved",
      jurisdiction: { in: jurisdictionsApplied },
      OR: [
        { localeCode: input.localeCode },
        { localeCode: null },
      ],
    },
    include: {
      rules: { where: { enabled: true } },
    },
    // Order: national obligations first (explicit list order), EU baseline last.
    // Within the same jurisdiction, oldest id first.
    orderBy: [{ jurisdiction: "asc" }, { id: "asc" }],
  });

  if (obligations.length === 0) {
    throw new Error(
      `No approved obligations for ${input.localeCode} across jurisdictions [${jurisdictionsApplied.join(", ")}]. Create and approve obligations first.`
    );
  }

  // ── 2. Build content ────────────────────────────────────────────────
  const bannedPhrases: string[] = [];
  const regexRules: RuleBundleContent["regexRules"] = [];
  const requiredDisclaimers: RuleBundleContent["requiredDisclaimers"] = [];
  const promptLines: string[] = [];
  const allSourceRefs: SourceRef[] = [];
  let ruleCount = 0;

  // Collect disclaimers (may be overridden per obligation)
  let riskWarning = "";
  let pastPerformance = "";

  for (const obl of obligations) {
    const sourceRefs = safeParse<SourceRef[]>(obl.sourceRefsJson, []);
    allSourceRefs.push(...sourceRefs);

    // Add to prompt context for LLM validators
    promptLines.push(`[${obl.severity.toUpperCase()}] ${obl.category}: ${obl.description}`);

    for (const rule of obl.rules) {
      ruleCount++;
      const config = safeParse<Record<string, any>>(rule.configJson, {});
      const severity = (rule.severity ?? obl.severity) as ObligationSeverity;

      switch (rule.ruleType) {
        case "banned_phrase": {
          const phrases = config.phrases ?? [];
          bannedPhrases.push(...phrases);
          break;
        }
        case "regex": {
          regexRules.push({
            pattern: config.pattern ?? "",
            flags: config.flags,
            message: config.message,
            severity,
          });
          break;
        }
        case "required_disclaimer": {
          requiredDisclaimers.push({
            text: config.text ?? "",
            triggers: config.triggers,
          });
          // First disclaimer of each type wins
          if (obl.category === "disclaimer" && !riskWarning && config.text) {
            riskWarning = config.text;
          }
          if (obl.category === "past_performance" && !pastPerformance && config.text) {
            pastPerformance = config.text;
          }
          break;
        }
        // prominence, semantic_check, conditional_disclosure — stored in
        // regexRules or kept as prompt context. V1 keeps them in the prompt.
        default: {
          promptLines.push(
            `  → Rule [${rule.ruleType}]: ${config.message ?? config.prompt ?? JSON.stringify(config)}`
          );
          break;
        }
      }
    }
  }

  // De-duplicate banned phrases (case-insensitive)
  const uniqueBanned = [...new Set(bannedPhrases.map(p => p.toLowerCase()))];

  const content: RuleBundleContent = {
    bannedPhrases: uniqueBanned,
    regexRules,
    requiredDisclaimers,
    promptContext: promptLines.join("\n"),
    disclaimers: {
      riskWarning: riskWarning || "(not specified in obligations — use locale default)",
      pastPerformance: pastPerformance || "(not specified in obligations — use locale default)",
    },
  };

  // ── 3. Hash + persist ───────────────────────────────────────────────
  const contentJson = JSON.stringify(content, null, 2);
  const contentHash = crypto.createHash("sha256").update(contentJson, "utf8").digest("hex");

  // Dedup source refs
  const seenRefs = new Set<string>();
  const uniqueRefs = allSourceRefs.filter(r => {
    const key = `${r.sourceCode}:${r.documentRef ?? ""}:${r.versionId ?? ""}`;
    if (seenRefs.has(key)) return false;
    seenRefs.add(key);
    return true;
  });

  // Compose a notes string that records the full composition for audit.
  const compositionNote = `composition: [${jurisdictionsApplied.join(" + ")}]`;
  const finalNotes = input.notes ? `${input.notes} — ${compositionNote}` : compositionNote;

  const bundle = await db.ruleBundle.create({
    data: {
      localeCode: input.localeCode,
      jurisdiction: primary,
      version: input.version,
      status: "draft",
      contentJson,
      contentHash,
      sourceRefsJson: JSON.stringify(uniqueRefs),
      notes: finalNotes,
    },
  });

  // Create a review task for the bundle
  await db.legalReviewTask.create({
    data: {
      kind: "bundle_publish",
      refType: "RuleBundle",
      refId: bundle.id,
      title: `Publish bundle: ${input.localeCode}@${input.version} (composition: ${jurisdictionsApplied.join("+")})`,
      status: "open",
    },
  });

  return {
    bundleId: bundle.id,
    localeCode: input.localeCode,
    jurisdiction: primary,
    jurisdictionsApplied,
    version: input.version,
    ruleCount,
    obligationCount: obligations.length,
  };
}
