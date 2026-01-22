/**
 * Uncertainty Marker
 * Adds simple qualifiers for conditional claims.
 */

import { ResponseMode } from '../../core/types/results.mjs';

export class UncertaintyMarker {
  mark(mode, lines) {
    if (mode !== ResponseMode.CONDITIONAL) {
      return lines;
    }
    return lines.map((line) => `possibly ${line}`);
  }
}

export function createUncertaintyMarker() {
  return new UncertaintyMarker();
}

export default {
  UncertaintyMarker,
  createUncertaintyMarker
};
