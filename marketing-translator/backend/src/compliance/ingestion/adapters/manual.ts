/**
 * ManualAdapter — safe fallback for any source.
 *
 * Returns no auto-discovered documents or versions.
 * Content is populated through the admin API / CLI upload.
 * This ensures every source has a valid adapter even before
 * we build a real parser, so syncs never crash.
 */

import type { SourceAdapter, AdapterResult } from "../types";
import type { SourceFamilyCode } from "@mexem/shared";

export class ManualAdapter implements SourceAdapter {
  readonly sourceCode: SourceFamilyCode;

  constructor(sourceCode: SourceFamilyCode) {
    this.sourceCode = sourceCode;
  }

  async sync(): Promise<AdapterResult> {
    return {
      sourceCode: this.sourceCode,
      documents: [],
      versions: [],
      warnings: [
        `${this.sourceCode}: using ManualAdapter — no automatic ingestion. Upload content via admin API.`,
      ],
    };
  }
}
