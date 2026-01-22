/**
 * Generation Service
 * Renders query results into text without introducing new claims.
 */

import { createClaimGate } from './constraints/claim-gate.mjs';
import { createModeAdapter } from './constraints/mode-adapter.mjs';
import { createClaimRenderer } from './realizer/claim-renderer.mjs';
import { createUncertaintyMarker } from './realizer/uncertainty-marker.mjs';
import { createTraceExplainer } from './realizer/trace-explainer.mjs';

export class GenerationService {
  constructor(options = {}) {
    this.claimGate = options.claimGate ?? createClaimGate();
    this.modeAdapter = options.modeAdapter ?? createModeAdapter();
    this.claimRenderer = options.claimRenderer ?? createClaimRenderer();
    this.uncertaintyMarker = options.uncertaintyMarker ?? createUncertaintyMarker();
    this.traceExplainer = options.traceExplainer ?? createTraceExplainer();
  }

  render(result) {
    const claims = this.claimGate.filterClaims(result);
    const lines = this.claimRenderer.renderClaims(claims);
    const marked = this.uncertaintyMarker.mark(result?.mode, lines);
    const adapted = this.modeAdapter.adapt(result?.mode, marked, result);
    const traceNote = this.traceExplainer.explain(result?.traceRefs);

    return {
      text: [adapted.text, traceNote].filter(Boolean).join(' '),
      lines: adapted.lines,
      traceNote
    };
  }
}

export function createGenerationService(options = {}) {
  return new GenerationService(options);
}

export default {
  GenerationService,
  createGenerationService
};
