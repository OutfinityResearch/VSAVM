/**
 * Mode Adapter
 * Adjusts output based on response mode.
 */

import { ResponseMode } from '../../core/types/results.mjs';

export class ModeAdapter {
  adapt(mode, lines, context = {}) {
    if (mode === ResponseMode.INDETERMINATE) {
      return {
        text: 'Indeterminate: insufficient evidence under current budget.',
        lines: []
      };
    }

    if (mode === ResponseMode.CONDITIONAL) {
      const prefix = 'Conditional:';
      return {
        text: [prefix, ...lines].join(' '),
        lines
      };
    }

    return {
      text: lines.join(' '),
      lines
    };
  }
}

export function createModeAdapter() {
  return new ModeAdapter();
}

export default {
  ModeAdapter,
  createModeAdapter
};
