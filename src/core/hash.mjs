/**
 * Simple hash utilities for VSAVM
 * Deterministic string hashing without external dependencies
 */

import { createHash } from 'node:crypto';

/**
 * Compute a simple hash of a string
 * Uses FNV-1a algorithm for good distribution
 * @param {string} str
 * @returns {string} Hex string hash
 */
export function computeHash(str) {
  let hash = 2166136261; // FNV offset basis
  
  for (let i = 0; i < str.length; i++) {
    hash ^= str.charCodeAt(i);
    hash = Math.imul(hash, 16777619); // FNV prime
    hash = hash >>> 0; // Convert to unsigned
  }
  
  return hash.toString(16).padStart(8, '0');
}

/**
 * Compute a longer hash by hashing multiple segments
 * @param {string} str
 * @param {number} [segments=4]
 * @returns {string} Combined hex hash
 */
export function computeLongHash(str, segments = 4) {
  const hashes = [];
  for (let i = 0; i < segments; i++) {
    hashes.push(computeHash(`${i}:${str}`));
  }
  return hashes.join('');
}

/**
 * Compute a numeric seed from a string (for VSA)
 * @param {string} str
 * @returns {number}
 */
export function stringToSeed(str) {
  let h1 = 0xdeadbeef;
  let h2 = 0x41c6ce57;
  
  for (let i = 0; i < str.length; i++) {
    const ch = str.charCodeAt(i);
    h1 = Math.imul(h1 ^ ch, 2654435761);
    h2 = Math.imul(h2 ^ ch, 1597334677);
  }
  
  h1 = Math.imul(h1 ^ (h1 >>> 16), 2246822507);
  h1 ^= Math.imul(h2 ^ (h2 >>> 13), 3266489909);
  h2 = Math.imul(h2 ^ (h2 >>> 16), 2246822507);
  h2 ^= Math.imul(h1 ^ (h1 >>> 13), 3266489909);
  
  return 4294967296 * (2097151 & h2) + (h1 >>> 0);
}

/**
 * Compute SHA-256 digest bytes.
 * @param {string | Uint8Array} data
 * @returns {Uint8Array} 32 bytes
 */
export function sha256(data) {
  const hash = createHash('sha256');
  if (typeof data === 'string') {
    hash.update(data, 'utf8');
  } else {
    hash.update(data);
  }
  return new Uint8Array(hash.digest());
}

/**
 * Compute SHA-256 digest and truncate to N bytes.
 * @param {string | Uint8Array} data
 * @param {number} bytes
 * @returns {Uint8Array}
 */
export function sha256Truncate(data, bytes) {
  if (!Number.isInteger(bytes) || bytes <= 0 || bytes > 32) {
    throw new Error(`sha256Truncate: bytes must be 1..32, got ${bytes}`);
  }
  return sha256(data).slice(0, bytes);
}

/**
 * Base64url encode bytes (no padding).
 * @param {Uint8Array} bytes
 * @returns {string}
 */
export function base64urlEncode(bytes) {
  return Buffer.from(bytes)
    .toString('base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/g, '');
}
