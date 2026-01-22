/**
 * Trace Explainer
 * Minimal trace renderer for audit output.
 */

export class TraceExplainer {
  explain(traceRefs) {
    if (!traceRefs || traceRefs.length === 0) {
      return '';
    }
    return `Trace: ${traceRefs.length} segment(s)`;
  }
}

export function createTraceExplainer() {
  return new TraceExplainer();
}

export default {
  TraceExplainer,
  createTraceExplainer
};
