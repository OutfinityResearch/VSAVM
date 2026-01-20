/**
 * Canonicalization Unit Tests
 * Tests for normalizers and canonicalizer strategies
 */

import { describe, it } from 'node:test';
import assert from 'node:assert';

// Normalizers
import { 
  normalizeText, 
  textsEquivalent,
  TEXT_NORMALIZE_DEFAULTS 
} from '../../src/canonicalization/normalizers/text-normalizer.mjs';
import { 
  normalizeNumber, 
  numbersEquivalent,
  canonicalNumberToString 
} from '../../src/canonicalization/normalizers/number-normalizer.mjs';
import { 
  normalizeTime, 
  timesEquivalent,
  canonicalTimeToString,
  truncateToPrecision 
} from '../../src/canonicalization/normalizers/time-normalizer.mjs';

// Strategies
import { StrictCanonicalizer } from '../../src/canonicalization/strategies/strict-canonical.mjs';
import { IdentityCanonicalizer } from '../../src/canonicalization/strategies/identity-canonical.mjs';

// Service
import { CanonicalService } from '../../src/canonicalization/canonical-service.mjs';

// Types
import { 
  stringAtom, 
  numberAtom, 
  integerAtom,
  booleanAtom,
  createStruct,
  createInstant,
  createInterval,
  TimePrecision,
  TimeRefType
} from '../../src/core/types/terms.mjs';
import { createSymbolId } from '../../src/core/types/identifiers.mjs';

// ============================================================
// Text Normalizer Tests
// ============================================================

describe('Text Normalizer', () => {
  it('normalizes case by default', () => {
    assert.strictEqual(normalizeText('Hello WORLD'), 'hello world');
  });

  it('preserves case when caseSensitive=true', () => {
    assert.strictEqual(
      normalizeText('Hello WORLD', { caseSensitive: true }), 
      'Hello WORLD'
    );
  });

  it('normalizes whitespace', () => {
    assert.strictEqual(normalizeText('  hello   world  '), 'hello world');
    assert.strictEqual(normalizeText('hello\t\nworld'), 'hello world');
  });

  it('strips punctuation by default', () => {
    assert.strictEqual(normalizeText('hello, world!'), 'hello world');
    assert.strictEqual(normalizeText('test@email.com'), 'testemailcom');
  });

  it('preserves punctuation when stripPunctuation=false', () => {
    assert.strictEqual(
      normalizeText('hello, world!', { stripPunctuation: false }), 
      'hello, world!'
    );
  });

  it('handles unicode normalization', () => {
    // Composed vs decomposed é
    const composed = 'caf\u00e9';  // é as single char
    const decomposed = 'cafe\u0301';  // e + combining acute
    assert.strictEqual(normalizeText(composed), normalizeText(decomposed));
  });

  it('checks text equivalence', () => {
    assert.ok(textsEquivalent('Hello', 'hello'));
    assert.ok(textsEquivalent('  test  ', 'test'));
    assert.ok(!textsEquivalent('hello', 'world'));
  });

  it('handles non-string input', () => {
    assert.strictEqual(normalizeText(123), '123');
    assert.strictEqual(normalizeText(null), '');
    assert.strictEqual(normalizeText(undefined), '');
  });
});

// ============================================================
// Number Normalizer Tests
// ============================================================

describe('Number Normalizer', () => {
  it('rounds to precision', () => {
    const result = normalizeNumber(3.14159265359);
    assert.strictEqual(result.type, 'finite');
    assert.strictEqual(result.value, 3.141593);  // 6 decimal places
  });

  it('handles NaN', () => {
    const result = normalizeNumber(NaN);
    assert.strictEqual(result.type, 'nan');
  });

  it('handles Infinity', () => {
    const posInf = normalizeNumber(Infinity);
    assert.strictEqual(posInf.type, 'infinity');
    assert.strictEqual(posInf.sign, 1);

    const negInf = normalizeNumber(-Infinity);
    assert.strictEqual(negInf.type, 'infinity');
    assert.strictEqual(negInf.sign, -1);
  });

  it('converts units to base', () => {
    const km = normalizeNumber(1, 'km');
    assert.strictEqual(km.value, 1000);
    assert.strictEqual(km.unit, 'm');

    const lb = normalizeNumber(1, 'lb');
    assert.strictEqual(lb.unit, 'kg');
    assert.ok(Math.abs(lb.value - 0.453592) < 0.000001);
  });

  it('handles temperature conversion', () => {
    // 32°F = 0°C
    const freezing = normalizeNumber(32, 'f');
    assert.strictEqual(freezing.unit, 'c');
    assert.ok(Math.abs(freezing.value - 0) < 0.000001);

    // 273.15K = 0°C
    const kelvin = normalizeNumber(273.15, 'k');
    assert.strictEqual(kelvin.unit, 'c');
    assert.ok(Math.abs(kelvin.value - 0) < 0.000001);
  });

  it('checks number equivalence', () => {
    assert.ok(numbersEquivalent(1.0000001, 1.0000002));  // Within precision
    assert.ok(!numbersEquivalent(1.0, 2.0));
    assert.ok(numbersEquivalent(NaN, NaN));
    assert.ok(numbersEquivalent(Infinity, Infinity));
  });

  it('converts to string', () => {
    assert.strictEqual(canonicalNumberToString({ type: 'nan' }), 'NaN');
    assert.strictEqual(canonicalNumberToString({ type: 'infinity', sign: 1 }), '+Infinity');
    assert.strictEqual(canonicalNumberToString({ type: 'finite', value: 3.14 }), '3.14');
    assert.strictEqual(canonicalNumberToString({ type: 'finite', value: 1000, unit: 'm' }), '1000:m');
  });
});

// ============================================================
// Time Normalizer Tests
// ============================================================

describe('Time Normalizer', () => {
  it('truncates instant to precision', () => {
    const instant = createInstant(1609459261123, TimePrecision.SECOND);
    const result = normalizeTime(instant);
    assert.strictEqual(result.type, 'instant');
    assert.strictEqual(result.value, 1609459261000);  // Truncated to second
  });

  it('handles interval normalization', () => {
    const interval = createInterval(1000, 2000, TimePrecision.SECOND);
    const result = normalizeTime(interval);
    assert.strictEqual(result.type, 'interval');
    assert.strictEqual(result.start, 1000);
    assert.strictEqual(result.end, 2000);
  });

  it('swaps inverted intervals', () => {
    const inverted = createInterval(2000, 1000, TimePrecision.SECOND);
    const result = normalizeTime(inverted);
    assert.strictEqual(result.start, 1000);
    assert.strictEqual(result.end, 2000);
  });

  it('handles relative time', () => {
    const relative = {
      type: TimeRefType.RELATIVE,
      anchor: 'event_1',
      offset: 3600000,
      precision: TimePrecision.HOUR
    };
    const result = normalizeTime(relative);
    assert.strictEqual(result.type, 'relative');
    assert.strictEqual(result.anchor, 'event_1');
    assert.strictEqual(result.offset, 3600000);
  });

  it('handles unknown time', () => {
    const unknown = { type: TimeRefType.UNKNOWN };
    const result = normalizeTime(unknown);
    assert.strictEqual(result.type, 'unknown');
  });

  it('truncates to various precisions', () => {
    const ts = 1609459261123;  // 2021-01-01T00:01:01.123Z

    assert.strictEqual(truncateToPrecision(ts, TimePrecision.MS), ts);
    assert.strictEqual(truncateToPrecision(ts, TimePrecision.SECOND), 1609459261000);
    assert.strictEqual(truncateToPrecision(ts, TimePrecision.MINUTE), 1609459260000);
    assert.strictEqual(truncateToPrecision(ts, TimePrecision.HOUR), 1609459200000);
    assert.strictEqual(truncateToPrecision(ts, TimePrecision.DAY), 1609459200000);
  });

  it('checks time equivalence', () => {
    const t1 = createInstant(1609459261000, TimePrecision.SECOND);
    const t2 = createInstant(1609459261500, TimePrecision.SECOND);
    assert.ok(timesEquivalent(t1, t2));  // Same after truncation
  });

  it('converts to string', () => {
    const instant = normalizeTime(createInstant(1000, TimePrecision.SECOND));
    assert.strictEqual(canonicalTimeToString(instant), 'instant:1000@second');

    const interval = normalizeTime(createInterval(1000, 2000, TimePrecision.SECOND));
    assert.strictEqual(canonicalTimeToString(interval), 'interval:1000..2000@second');
  });
});

// ============================================================
// Identity Canonicalizer Tests
// ============================================================

describe('Identity Canonicalizer', () => {
  it('returns terms unchanged', () => {
    const canonicalizer = new IdentityCanonicalizer();
    
    const atom = stringAtom('Hello World');
    const result = canonicalizer.canonicalize(atom);
    
    assert.strictEqual(result.type, 'string');
    assert.strictEqual(result.value, 'Hello World');  // Not normalized
  });

  it('generates hash', () => {
    const canonicalizer = new IdentityCanonicalizer();
    
    const atom = stringAtom('test');
    const hash = canonicalizer.hash(atom);
    
    assert.ok(typeof hash === 'string');
    assert.ok(hash.length > 0);
  });

  it('checks equivalence', () => {
    const canonicalizer = new IdentityCanonicalizer();
    
    const a = stringAtom('test');
    const b = stringAtom('test');
    const c = stringAtom('TEST');
    
    assert.ok(canonicalizer.areEquivalent(a, b));
    assert.ok(!canonicalizer.areEquivalent(a, c));  // Case matters
  });

  it('deep clones structs', () => {
    const canonicalizer = new IdentityCanonicalizer();
    
    const struct = createStruct(
      createSymbolId('test', 'Person'),
      { name: stringAtom('Alice') }
    );
    
    const result = canonicalizer.canonicalize(struct);
    
    // Modify original
    struct.slots.set('age', numberAtom(30));
    
    // Result should not be affected
    assert.ok(!result.slots.has('age'));
  });
});

// ============================================================
// Strict Canonicalizer Tests
// ============================================================

describe('Strict Canonicalizer', () => {
  it('normalizes string atoms', () => {
    const canonicalizer = new StrictCanonicalizer();
    
    const atom = stringAtom('  Hello, World!  ');
    const result = canonicalizer.canonicalize(atom);
    
    assert.strictEqual(result.value, 'hello world');
  });

  it('normalizes number atoms', () => {
    const canonicalizer = new StrictCanonicalizer();
    
    const atom = numberAtom(3.14159265359);
    const result = canonicalizer.canonicalize(atom);
    
    assert.strictEqual(result.value, 3.141593);
  });

  it('normalizes integer atoms', () => {
    const canonicalizer = new StrictCanonicalizer();
    
    const atom = integerAtom(42.9);
    const result = canonicalizer.canonicalize(atom);
    
    assert.strictEqual(result.value, 42);
  });

  it('normalizes struct slots', () => {
    const canonicalizer = new StrictCanonicalizer();
    
    const struct = createStruct(
      createSymbolId('test', 'Person'),
      {
        name: stringAtom('  ALICE  '),
        age: numberAtom(30.123456789)
      }
    );
    
    const result = canonicalizer.canonicalize(struct);
    
    assert.strictEqual(result.slots.get('name').value, 'alice');
    assert.strictEqual(result.slots.get('age').value, 30.123457);
  });

  it('sorts struct slots lexicographically', () => {
    const canonicalizer = new StrictCanonicalizer();
    
    const struct = createStruct(
      createSymbolId('test', 'Data'),
      {
        z: stringAtom('last'),
        a: stringAtom('first'),
        m: stringAtom('middle')
      }
    );
    
    const result = canonicalizer.canonicalize(struct);
    const keys = [...result.slots.keys()];
    
    assert.deepStrictEqual(keys, ['a', 'm', 'z']);
  });

  it('generates consistent hashes', () => {
    const canonicalizer = new StrictCanonicalizer();
    
    const atom1 = stringAtom('Hello World');
    const atom2 = stringAtom('  HELLO world  ');
    
    const hash1 = canonicalizer.hash(atom1);
    const hash2 = canonicalizer.hash(atom2);
    
    assert.strictEqual(hash1, hash2);  // Same after normalization
  });

  it('checks equivalence correctly', () => {
    const canonicalizer = new StrictCanonicalizer();
    
    const a = stringAtom('Hello');
    const b = stringAtom('HELLO');
    const c = stringAtom('World');
    
    assert.ok(canonicalizer.areEquivalent(a, b));
    assert.ok(!canonicalizer.areEquivalent(a, c));
  });

  it('respects custom options', () => {
    const canonicalizer = new StrictCanonicalizer({
      caseSensitive: true,
      stripPunctuation: false
    });
    
    const atom = stringAtom('Hello, World!');
    const result = canonicalizer.canonicalize(atom);
    
    assert.strictEqual(result.value, 'Hello, World!');
  });
});

// ============================================================
// Canonical Service Tests
// ============================================================

describe('Canonical Service', () => {
  it('uses strict strategy by default', () => {
    const service = new CanonicalService();
    assert.strictEqual(service.getStrategyName(), 'strict');
  });

  it('canonicalizes terms', () => {
    const service = new CanonicalService();
    
    const atom = stringAtom('  TEST  ');
    const result = service.canonicalize(atom);
    
    assert.strictEqual(result.value, 'test');
  });

  it('supports identity strategy', () => {
    const service = new CanonicalService({ strategy: 'identity' });
    
    const atom = stringAtom('  TEST  ');
    const result = service.canonicalize(atom);
    
    assert.strictEqual(result.value, '  TEST  ');  // Unchanged
  });

  it('switches strategies', () => {
    const service = new CanonicalService();
    
    assert.strictEqual(service.getStrategyName(), 'strict');
    
    service.setStrategy('identity');
    assert.strictEqual(service.getStrategyName(), 'identity');
  });

  it('validates terms', () => {
    const service = new CanonicalService();
    
    const valid = stringAtom('test');
    const invalid = { foo: 'bar' };
    
    assert.ok(service.validate(valid).valid);
    assert.ok(!service.validate(invalid).valid);
    assert.ok(!service.validate(null).valid);
  });

  it('throws on invalid term with canonicalizeSafe', () => {
    const service = new CanonicalService();
    
    assert.throws(() => {
      service.canonicalizeSafe(null);
    });
  });

  it('exposes direct normalizer access', () => {
    const service = new CanonicalService();
    
    assert.strictEqual(service.normalizeText('  TEST  '), 'test');
    assert.strictEqual(service.normalizeNumber(3.14159).value, 3.141590);
  });

  it('generates hashes', () => {
    const service = new CanonicalService();
    
    const atom = stringAtom('test');
    const hash = service.hash(atom);
    
    assert.ok(typeof hash === 'string');
    assert.ok(hash.length > 0);
  });

  it('checks equivalence', () => {
    const service = new CanonicalService();
    
    const a = stringAtom('Hello');
    const b = stringAtom('HELLO');
    
    assert.ok(service.areEquivalent(a, b));
  });
});
