/**
 * Residual Cost Calculator
 * Per DS003/DS008: Prediction loss component of MDL
 */

/**
 * Default residual cost weights
 */
export const RESIDUAL_WEIGHTS = {
  mismatchPenalty: 1.0,        // Cost per prediction mismatch
  missingPenalty: 0.5,         // Cost for missing prediction
  extraPenalty: 0.3,           // Cost for extra (unexpected) output
  confidenceWeight: 0.2        // Weight for confidence difference
};

/**
 * Residual Cost Calculator
 * Computes prediction loss: how well program output matches expected
 */
export class ResidualCostCalculator {
  /**
   * @param {Object} [weights]
   */
  constructor(weights = {}) {
    this.weights = { ...RESIDUAL_WEIGHTS, ...weights };
  }

  /**
   * Compute residual cost for program on evaluation examples
   * Per DS008 compute_residual_cost
   * @param {Object} program - Program to evaluate
   * @param {Array} examples - Evaluation examples [{input, expected}]
   * @param {Function} [executor] - Function to execute program
   * @returns {number} - Residual cost (lower is better fit)
   */
  compute(program, examples, executor = null) {
    if (!examples || examples.length === 0) {
      return 0.0;  // No evaluation data
    }

    let totalLoss = 0.0;

    for (const example of examples) {
      const result = executor 
        ? executor(program, example.input)
        : this._simulateExecution(program, example.input);
      
      const loss = this.computeLoss(result, example.expected);
      totalLoss += loss;
    }

    return totalLoss / examples.length;
  }

  /**
   * Compute loss between result and expected
   * @param {Object} result - Program execution result
   * @param {Object} expected - Expected output
   * @returns {number}
   */
  computeLoss(result, expected) {
    if (!expected) return 0;

    let loss = 0;

    // Compare claims/facts
    const resultClaims = this._extractClaims(result);
    const expectedClaims = this._extractClaims(expected);

    // Mismatch penalty: claims that differ
    const mismatches = this._countMismatches(resultClaims, expectedClaims);
    loss += mismatches * this.weights.mismatchPenalty;

    // Missing penalty: expected but not produced
    const missing = this._countMissing(resultClaims, expectedClaims);
    loss += missing * this.weights.missingPenalty;

    // Extra penalty: produced but not expected
    const extra = this._countExtra(resultClaims, expectedClaims);
    loss += extra * this.weights.extraPenalty;

    // Confidence difference penalty
    const confidenceDiff = this._computeConfidenceDiff(resultClaims, expectedClaims);
    loss += confidenceDiff * this.weights.confidenceWeight;

    return loss;
  }

  /**
   * Get detailed breakdown of residual components
   * @param {Object} result
   * @param {Object} expected
   * @returns {Object}
   */
  breakdown(result, expected) {
    const resultClaims = this._extractClaims(result);
    const expectedClaims = this._extractClaims(expected);

    const mismatches = this._countMismatches(resultClaims, expectedClaims);
    const missing = this._countMissing(resultClaims, expectedClaims);
    const extra = this._countExtra(resultClaims, expectedClaims);
    const confidenceDiff = this._computeConfidenceDiff(resultClaims, expectedClaims);

    return {
      resultClaimCount: resultClaims.length,
      expectedClaimCount: expectedClaims.length,
      mismatches,
      mismatchCost: mismatches * this.weights.mismatchPenalty,
      missing,
      missingCost: missing * this.weights.missingPenalty,
      extra,
      extraCost: extra * this.weights.extraPenalty,
      confidenceDiff,
      confidenceCost: confidenceDiff * this.weights.confidenceWeight,
      total: this.computeLoss(result, expected)
    };
  }

  /**
   * Extract claims from result/expected
   * @private
   */
  _extractClaims(obj) {
    if (!obj) return [];
    
    if (Array.isArray(obj)) return obj;
    if (obj.claims && Array.isArray(obj.claims)) return obj.claims;
    if (obj.facts && Array.isArray(obj.facts)) return obj.facts;
    if (obj.derived) {
      return obj.derived instanceof Set ? [...obj.derived] : obj.derived;
    }
    
    return [];
  }

  /**
   * Count mismatches between result and expected
   * @private
   */
  _countMismatches(resultClaims, expectedClaims) {
    let count = 0;

    const resultIds = new Set(resultClaims.map(c => this._claimId(c)));
    const expectedIds = new Set(expectedClaims.map(c => this._claimId(c)));

    // Check for polarity mismatches on same factId
    for (const rc of resultClaims) {
      for (const ec of expectedClaims) {
        if (this._sameFactId(rc, ec) && this._differentPolarity(rc, ec)) {
          count++;
        }
      }
    }

    return count;
  }

  /**
   * Count missing claims (expected but not in result)
   * @private
   */
  _countMissing(resultClaims, expectedClaims) {
    const resultIds = new Set(resultClaims.map(c => this._claimId(c)));
    let count = 0;

    for (const ec of expectedClaims) {
      const id = this._claimId(ec);
      if (!resultIds.has(id)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Count extra claims (in result but not expected)
   * @private
   */
  _countExtra(resultClaims, expectedClaims) {
    const expectedIds = new Set(expectedClaims.map(c => this._claimId(c)));
    let count = 0;

    for (const rc of resultClaims) {
      const id = this._claimId(rc);
      if (!expectedIds.has(id)) {
        count++;
      }
    }

    return count;
  }

  /**
   * Compute average confidence difference
   * @private
   */
  _computeConfidenceDiff(resultClaims, expectedClaims) {
    if (resultClaims.length === 0 || expectedClaims.length === 0) {
      return 0;
    }

    let totalDiff = 0;
    let count = 0;

    const expectedMap = new Map();
    for (const ec of expectedClaims) {
      expectedMap.set(this._claimId(ec), ec);
    }

    for (const rc of resultClaims) {
      const id = this._claimId(rc);
      const ec = expectedMap.get(id);
      if (ec) {
        const rcConf = rc.confidence ?? 1.0;
        const ecConf = ec.confidence ?? 1.0;
        totalDiff += Math.abs(rcConf - ecConf);
        count++;
      }
    }

    return count > 0 ? totalDiff / count : 0;
  }

  /**
   * Get claim identifier
   * @private
   */
  _claimId(claim) {
    if (!claim) return '';
    if (claim.claimId) return claim.claimId;
    if (claim.factId) return claim.factId;
    if (claim.content?.factId) return claim.content.factId;
    
    // Build from predicate + args
    const pred = claim.predicate ?? claim.content?.predicate ?? '';
    const args = JSON.stringify(claim.arguments ?? claim.content?.arguments ?? {});
    return `${pred}:${args}`;
  }

  /**
   * Check if two claims have same factId
   * @private
   */
  _sameFactId(a, b) {
    const idA = a.factId ?? a.content?.factId;
    const idB = b.factId ?? b.content?.factId;
    return idA && idB && idA === idB;
  }

  /**
   * Check if two claims have different polarity
   * @private
   */
  _differentPolarity(a, b) {
    const polA = a.polarity ?? a.content?.polarity ?? 'assert';
    const polB = b.polarity ?? b.content?.polarity ?? 'assert';
    return polA !== polB;
  }

  /**
   * Simulate execution (placeholder)
   * @private
   */
  _simulateExecution(program, input) {
    // Return empty result - real implementation would execute program
    return { claims: [] };
  }
}

/**
 * Create a residual cost calculator
 * @param {Object} [weights]
 * @returns {ResidualCostCalculator}
 */
export function createResidualCostCalculator(weights = {}) {
  return new ResidualCostCalculator(weights);
}

/**
 * Quick compute residual cost
 * @param {Object} result
 * @param {Object} expected
 * @param {Object} [weights]
 * @returns {number}
 */
export function computeResidualLoss(result, expected, weights = {}) {
  const calc = new ResidualCostCalculator(weights);
  return calc.computeLoss(result, expected);
}

export default {
  ResidualCostCalculator,
  createResidualCostCalculator,
  computeResidualLoss,
  RESIDUAL_WEIGHTS
};
