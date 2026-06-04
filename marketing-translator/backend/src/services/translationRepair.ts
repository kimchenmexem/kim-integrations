import { qualityGateConfig } from "./qualityGateConfig";
import { QualityIssue } from "./translationQualityReview";
import { HardCheckIssue } from "./translationHardChecks";
import { lazyOpenAI } from "./openaiHelpers";

const openai = lazyOpenAI(60_000);

/**
 * Attempts to repair a translation based on identified issues.
 * Returns the repaired text, or null if repair is not possible.
 */
export async function repairTranslation(
  sourceText: string,
  translation: string,
  targetLocale: string,
  sourceLanguage: string,
  qualityIssues: QualityIssue[],
  hardCheckIssues: HardCheckIssue[],
  repairInstructions: string[],
  existingVersions: string[] = []
): Promise<string | null> {
  const allIssues = [
    ...qualityIssues.map(i => `[${i.severity}] ${i.code}: ${i.message}`),
    ...hardCheckIssues.map(i => `[${i.severity}] ${i.code}: ${i.message}`),
  ];

  if (allIssues.length === 0) return null;

  const systemPrompt = `You are a translation repair specialist for MEXEM, a regulated financial trading platform.
You will receive a source text, a flawed translation, and a list of identified issues.

Your task:
- Fix ONLY the identified issues. Do not change anything else.
- Preserve the overall meaning, tone, and structure.
- Preserve all brand names, placeholders, HTML tags, numbers, and currencies exactly.
- If the source has {{variable}} or %s style placeholders, the output MUST contain the same ones.
- Output ONLY the corrected translation text. No explanations, no JSON, no quotes.`;

  const avoidBlock = existingVersions.length
    ? `\n\nALREADY-GENERATED VERSIONS (your output MUST be clearly different — different wording, structure, and opening):\n${existingVersions.map((v, i) => `- Version ${i + 1}: ${v}`).join("\n")}`
    : "";

  const userMessage = `SOURCE (${sourceLanguage}):
${sourceText}

FLAWED TRANSLATION (${targetLocale}):
${translation}

ISSUES FOUND:
${allIssues.join("\n")}

REPAIR INSTRUCTIONS:
${repairInstructions.length > 0 ? repairInstructions.join("\n") : "Fix the issues listed above."}${avoidBlock}

Output only the corrected translation:`;

  try {
    const response = await openai.chat.completions.create({
      model: qualityGateConfig.repairModel,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userMessage },
      ],
      temperature: existingVersions.length > 0 ? 0.6 : 0.2,
      max_tokens: qualityGateConfig.repairMaxTokens,
    });

    const repaired = response.choices?.[0]?.message?.content?.trim();
    if (!repaired || repaired.length === 0) return null;
    // If repair converged on an existing version, signal failure so caller can fall back
    if (existingVersions.some(v => v.toLowerCase().trim() === repaired.toLowerCase().trim())) {
      return null;
    }
    return repaired;
  } catch (error) {
    console.error("Translation repair error:", error);
    return null;
  }
}

/**
 * Regenerates a translation from scratch with stronger constraints
 * based on the issues detected in previous attempts.
 */
export async function regenerateTranslation(
  sourceText: string,
  targetLocale: string,
  sourceLanguage: string,
  originalSystemPrompt: string,
  failedAttemptIssues: QualityIssue[],
  existingVersions: string[] = []
): Promise<string | null> {
  const issueWarnings = failedAttemptIssues
    .map(i => `- Avoid: ${i.code} issue — ${i.message}`)
    .join("\n");

  const avoidBlock = existingVersions.length
    ? `\n\nALREADY-GENERATED VERSIONS (your output MUST be clearly different — use different wording, structure, and opening):\n${existingVersions.map((v, i) => `- Version ${i + 1}: ${v}`).join("\n")}`
    : "";

  const reinforcedPrompt = `${originalSystemPrompt}

CRITICAL — PREVIOUS ATTEMPT FAILED QUALITY REVIEW. You MUST avoid these specific issues:
${issueWarnings}${avoidBlock}

Take extra care with accuracy, natural phrasing, and preserving all formatting.
Output only the translated text, nothing else.`;

  try {
    const response = await openai.chat.completions.create({
      model: qualityGateConfig.repairModel,
      messages: [
        { role: "system", content: reinforcedPrompt },
        { role: "user", content: sourceText },
      ],
      temperature: existingVersions.length > 0 ? 0.7 : 0.3,
      max_tokens: qualityGateConfig.repairMaxTokens,
    });

    const text = response.choices?.[0]?.message?.content?.trim();
    if (!text || text.length === 0) return null;
    if (existingVersions.some(v => v.toLowerCase().trim() === text.toLowerCase().trim())) {
      return null;
    }
    return text;
  } catch (error) {
    console.error("Translation regeneration error:", error);
    return null;
  }
}
