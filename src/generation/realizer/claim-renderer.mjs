/**
 * Claim Renderer
 * Convert claims to text using deterministic formatting.
 */

import { termToString } from '../../core/types/terms.mjs';

export class ClaimRenderer {
  renderClaim(claim) {
    if (!claim) return '';
    const content = claim.content ?? claim;
    return termToString(content);
  }

  renderClaims(claims) {
    return (claims ?? []).map((claim) => this.renderClaim(claim));
  }
}

export function createClaimRenderer() {
  return new ClaimRenderer();
}

export default {
  ClaimRenderer,
  createClaimRenderer
};
