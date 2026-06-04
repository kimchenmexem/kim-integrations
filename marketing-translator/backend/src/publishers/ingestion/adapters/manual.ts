/**
 * ManualAdapter — safe no-op for publishers that require manual content upload.
 * Returns zero items with a warning.
 */

import type { PublisherAdapter, PublisherAdapterResult } from "../types";

export class ManualPublisherAdapter implements PublisherAdapter {
  readonly sourceCode: string;
  constructor(sourceCode: string) { this.sourceCode = sourceCode; }

  async sync(): Promise<PublisherAdapterResult> {
    return {
      sourceCode: this.sourceCode,
      items: [],
      warnings: [`${this.sourceCode}: ManualAdapter — no automatic ingestion. Upload items via admin API.`],
    };
  }
}
