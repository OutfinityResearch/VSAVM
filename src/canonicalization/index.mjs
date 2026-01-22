/**
 * Canonicalization module index
 */

export { CanonicalService } from './canonical-service.mjs';
export { StrictCanonicalizer } from './strategies/strict-canonical.mjs';
export { IdentityCanonicalizer } from './strategies/identity-canonical.mjs';
export { 
  normalizeText, 
  textsEquivalent, 
  TEXT_NORMALIZE_DEFAULTS 
} from './normalizers/text-normalizer.mjs';
export { 
  normalizeNumber, 
  numbersEquivalent, 
  canonicalNumberToString 
} from './normalizers/number-normalizer.mjs';
export { 
  normalizeTime, 
  timesEquivalent, 
  canonicalTimeToString, 
  truncateToPrecision 
} from './normalizers/time-normalizer.mjs';
export { resolveEntity, ENTITY_RESOLUTION_DEFAULTS } from './normalizers/entity-resolver.mjs';
