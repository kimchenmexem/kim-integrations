import { qualityGateConfig } from "./qualityGateConfig";
import { runHardChecks, HardCheckResult, HardCheckIssue } from "./translationHardChecks";
import { reviewTranslationQuality, QualityReviewResult, QualityIssue } from "./translationQualityReview";
import { repairTranslation, regenerateTranslation } from "./translationRepair";
import { prisma } from "../db";

export type ReviewStage = "initial" | "repair" | "regeneration";

export interface QualityGateResult {
  /** The final translation text (may differ from input if repaired/regenerated) */
  outputText: string;
  /** Combined quality score (0–1) */
  qualityScore: number;
  /** Whether the quality gate approved this translation */
  qualityApproved: boolean;
  /** Which stage produced the final result */
  stage: ReviewStage;
  /** All issues found across stages */
  issues: QualityIssue[];
  /** Hard check results */
  hardCheckIssues: HardCheckIssue[];
  /** Full review trail for persistence */
  reviewTrail: ReviewTrailEntry[];
}

interface ReviewTrailEntry {
  stage: ReviewStage;
  inputText: string;
  score: number;
  approved: boolean;
  issues: QualityIssue[];
  hardCheckIssues: HardCheckIssue[];
  repairInstructions: string[];
}

/**
 * Runs the full quality gate pipeline on a single translation:
 *   1. Hard checks + LLM review
 *   2. If fails → repair (if enabled)
 *   3. If repair fails → regenerate once (if enabled)
 *   4. Return best passing result, or best available if nothing passes
 */
export async function runQualityGate(
  sourceText: string,
  translation: string,
  targetLocale: string,
  textType: string,
  sourceLanguage: string,
  /** The original system prompt, needed for regeneration */
  systemPrompt: string,
  /** Existing versions to avoid converging on during repair/regeneration */
  existingVersions: string[] = []
): Promise<QualityGateResult> {
  if (!qualityGateConfig.enabled) {
    return bypass(translation);
  }

  const trail: ReviewTrailEntry[] = [];
  const threshold = qualityGateConfig.minPassingScore;

  // ── Stage 1: Initial review ─────────────────────────────────────
  const initialResult = await evaluateTranslation(
    sourceText, translation, targetLocale, textType, sourceLanguage, "initial"
  );
  trail.push(initialResult);

  if (passes(initialResult, threshold)) {
    return buildResult(translation, initialResult, trail);
  }

  // If the reviewer provided a confident fix and it's a minor repair, try it directly
  // — but skip if it duplicates an existing version (would collapse follow-up versions onto the same text)
  const existingSet = new Set(existingVersions.map(v => v.toLowerCase().trim()));
  const fixed = initialResult.review.fixedTranslation;
  if (fixed && qualityGateConfig.repairEnabled && !existingSet.has(fixed.toLowerCase().trim())) {
    const fixedCheck = await evaluateTranslation(
      sourceText, fixed, targetLocale, textType, sourceLanguage, "repair"
    );
    trail.push(fixedCheck);

    if (passes(fixedCheck, threshold)) {
      return buildResult(fixed, fixedCheck, trail);
    }
  }

  // ── Stage 2: Repair pass ────────────────────────────────────────
  if (qualityGateConfig.repairEnabled) {
    const repaired = await repairTranslation(
      sourceText,
      translation,
      targetLocale,
      sourceLanguage,
      initialResult.review.issues,
      initialResult.hardCheck.issues,
      initialResult.review.repairInstructions,
      existingVersions
    );

    if (repaired) {
      const repairResult = await evaluateTranslation(
        sourceText, repaired, targetLocale, textType, sourceLanguage, "repair"
      );
      trail.push(repairResult);

      if (passes(repairResult, threshold)) {
        return buildResult(repaired, repairResult, trail);
      }
    }
  }

  // ── Stage 3: Regeneration fallback ──────────────────────────────
  if (qualityGateConfig.regenerationEnabled) {
    const allIssues = trail.flatMap(t => t.issues);
    const regenerated = await regenerateTranslation(
      sourceText, targetLocale, sourceLanguage, systemPrompt, allIssues, existingVersions
    );

    if (regenerated) {
      const regenResult = await evaluateTranslation(
        sourceText, regenerated, targetLocale, textType, sourceLanguage, "regeneration"
      );
      trail.push(regenResult);

      if (passes(regenResult, threshold)) {
        return buildResult(regenerated, regenResult, trail);
      }
    }
  }

  // ── Nothing passed — return best available ──────────────────────
  const best = pickBest(trail, translation);
  return {
    outputText: best.text,
    qualityScore: best.entry.score,
    qualityApproved: false,
    stage: best.entry.stage,
    issues: best.entry.issues,
    hardCheckIssues: best.entry.hardCheckIssues,
    reviewTrail: trail,
  };
}

/**
 * Persists all review trail entries to the database.
 * Called after the TranslationOutput record is created.
 */
export async function persistQualityReviews(
  translationOutputId: number,
  result: QualityGateResult
): Promise<void> {
  if (result.reviewTrail.length === 0) return;

  await prisma.translationQualityReview.createMany({
    data: result.reviewTrail.map(entry => ({
      translationOutputId,
      score: entry.score,
      approved: entry.approved,
      reviewerModel: qualityGateConfig.reviewModel,
      issuesJson: JSON.stringify(entry.issues),
      repairInstructions: entry.repairInstructions.length > 0
        ? JSON.stringify(entry.repairInstructions)
        : null,
      hardCheckIssuesJson: entry.hardCheckIssues.length > 0
        ? JSON.stringify(entry.hardCheckIssues)
        : null,
      reviewStage: entry.stage,
      inputText: entry.inputText,
    })),
  });
}

// ─── Internal helpers ──────────────────────────────────────────────

interface EvaluationResult {
  review: QualityReviewResult;
  hardCheck: HardCheckResult;
  combined: { score: number; approved: boolean };
}

async function evaluateTranslation(
  sourceText: string,
  translation: string,
  targetLocale: string,
  textType: string,
  sourceLanguage: string,
  stage: ReviewStage
): Promise<ReviewTrailEntry & { review: QualityReviewResult; hardCheck: HardCheckResult }> {
  // Run hard checks and LLM review in parallel
  const [hardCheck, review] = await Promise.all([
    runHardChecks(sourceText, translation, targetLocale),
    reviewTranslationQuality(sourceText, translation, targetLocale, textType, sourceLanguage, []),
  ]);

  // If hard checks found issues, re-run the LLM review with that context
  // so it can incorporate them into its scoring
  let finalReview = review;
  if (hardCheck.issues.length > 0 && review.approved) {
    finalReview = await reviewTranslationQuality(
      sourceText, translation, targetLocale, textType, sourceLanguage, hardCheck.issues
    );
  }

  // Combine scores: hard check failures cap the score
  const hasCriticalHard = hardCheck.issues.some(i => i.severity === "critical");
  const score = hasCriticalHard
    ? Math.min(finalReview.score, 0.3)
    : finalReview.score;
  const approved = finalReview.approved && hardCheck.passed && !hasCriticalHard;

  return {
    stage,
    inputText: translation,
    score,
    approved,
    issues: finalReview.issues,
    hardCheckIssues: hardCheck.issues,
    repairInstructions: finalReview.repairInstructions,
    review: finalReview,
    hardCheck,
  };
}

function passes(entry: ReviewTrailEntry, threshold: number): boolean {
  return entry.approved && entry.score >= threshold &&
    !entry.issues.some(i => i.severity === "critical");
}

function buildResult(
  text: string,
  entry: ReviewTrailEntry,
  trail: ReviewTrailEntry[]
): QualityGateResult {
  return {
    outputText: text,
    qualityScore: entry.score,
    qualityApproved: true,
    stage: entry.stage,
    issues: entry.issues,
    hardCheckIssues: entry.hardCheckIssues,
    reviewTrail: trail,
  };
}

function pickBest(trail: ReviewTrailEntry[], originalText: string): { text: string; entry: ReviewTrailEntry } {
  if (trail.length === 0) {
    return {
      text: originalText,
      entry: { stage: "initial", inputText: originalText, score: 0, approved: false, issues: [], hardCheckIssues: [], repairInstructions: [] },
    };
  }
  // Pick the entry with the highest score
  const sorted = [...trail].sort((a, b) => b.score - a.score);
  return { text: sorted[0].inputText, entry: sorted[0] };
}

function bypass(translation: string): QualityGateResult {
  return {
    outputText: translation,
    qualityScore: 1,
    qualityApproved: true,
    stage: "initial",
    issues: [],
    hardCheckIssues: [],
    reviewTrail: [],
  };
}
