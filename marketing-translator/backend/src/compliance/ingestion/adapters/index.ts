/**
 * Adapter registry — maps source codes to adapter instances.
 *
 * Sources without a dedicated adapter fall back to ManualAdapter.
 */

import type { SourceAdapter } from "../types";
import type { SourceFamilyCode } from "@mexem/shared";
import { ManualAdapter } from "./manual";
import { EurLexAdapter } from "./eurlex";
import { FcaAdapter } from "./fca";
import { EsmaAdapter } from "./esma";

const DEDICATED_ADAPTERS: SourceAdapter[] = [
  new EurLexAdapter(),
  new FcaAdapter(),
  new EsmaAdapter(),
];

const adapterMap = new Map<SourceFamilyCode, SourceAdapter>(
  DEDICATED_ADAPTERS.map((a) => [a.sourceCode, a])
);

/**
 * Get the adapter for a source code.
 * Returns a ManualAdapter if no dedicated adapter exists.
 */
export function getAdapter(code: SourceFamilyCode): SourceAdapter {
  return adapterMap.get(code) ?? new ManualAdapter(code);
}

/** All source codes that have a dedicated (non-manual) adapter. */
export function getDedicatedAdapterCodes(): SourceFamilyCode[] {
  return [...adapterMap.keys()];
}
