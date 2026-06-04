/** Quality gate configuration — all tuneable via env vars */
export const qualityGateConfig = {
  /** Model used for the quality reviewer LLM call */
  reviewModel: process.env.QG_REVIEW_MODEL ?? "gpt-4o-mini",
  /** Model used for the repair LLM call */
  repairModel: process.env.QG_REPAIR_MODEL ?? "gpt-4o-mini",
  /** Minimum score (0–1) for a translation to pass without repair */
  minPassingScore: parseFloat(process.env.QG_MIN_PASSING_SCORE ?? "0.75"),
  /** Enable the automatic repair pass */
  repairEnabled: process.env.QG_REPAIR_ENABLED !== "false",
  /** Enable fallback regeneration when repair fails */
  regenerationEnabled: process.env.QG_REGENERATION_ENABLED !== "false",
  /** Enable the entire quality gate (kill-switch) */
  enabled: process.env.QG_ENABLED !== "false",
  /** Max tokens for the review call */
  reviewMaxTokens: 800,
  /** Max tokens for the repair call */
  repairMaxTokens: 800,
};
