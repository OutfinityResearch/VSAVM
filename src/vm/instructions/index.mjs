/**
 * VM Instructions index
 */

export { termOps, makeTerm, canonicalize, bindSlots } from './term-ops.mjs';
export { factOps, assertFact, denyFact, queryFacts } from './fact-ops.mjs';
export { logicOps, match, applyRule, closure } from './logic-ops.mjs';
export { controlOps, branch, jump, call, returnOp } from './control-ops.mjs';
export { contextOps, pushContext, popContext, mergeContext, isolateContext } from './context-ops.mjs';
export { builtinOps, count, filter, map, reduce } from './builtin-ops.mjs';

/**
 * All operations combined
 */
import { termOps } from './term-ops.mjs';
import { factOps } from './fact-ops.mjs';
import { logicOps } from './logic-ops.mjs';
import { controlOps } from './control-ops.mjs';
import { contextOps } from './context-ops.mjs';
import { builtinOps } from './builtin-ops.mjs';

export const allOps = {
  ...termOps,
  ...factOps,
  ...logicOps,
  ...controlOps,
  ...contextOps,
  ...builtinOps
};
