/**
 * Disk-backed FileStore (experimental)
 * Per DS012: append-only, length-prefixed records using DS007 Fact binary encoding.
 *
 * This strategy is optional and does not affect default behavior.
 */

import { mkdir } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { open } from 'node:fs/promises';

import { StorageStrategy } from '../../core/interfaces/storage-strategy.mjs';
import { base64urlDecode, base64urlEncode, crc32Bytes } from '../../core/hash.mjs';
import { deserializeFactInstanceBinary, serializeFactInstanceBinary, factsConflict } from '../../core/types/facts.mjs';
import { symbolIdToString, scopeContains } from '../../core/types/identifiers.mjs';
import { timeOverlaps, isAtom, isStruct, termsEqual } from '../../core/types/terms.mjs';

const textEncoder = new TextEncoder();
const textDecoder = new TextDecoder();

const RECORD_MAGIC_FACT = 'FACT';
const RECORD_MAGIC_TOMB = 'TOMB';

function encodeU32LE(value) {
  const buf = Buffer.alloc(4);
  buf.writeUInt32LE(value >>> 0, 0);
  return buf;
}

function decodeU32LE(buf) {
  return buf.readUInt32LE(0);
}

function stableSnapshotId(counter) {
  return `snap_${String(counter).padStart(6, '0')}`;
}

function encodeTombstoneRecord(factId) {
  const factIdBytes = base64urlDecode(factId);
  if (factIdBytes.length !== 48) {
    throw new Error('Tombstone requires a 48-byte FactId');
  }

  const header = new Uint8Array(4 + 2 + 2 + 48);
  header.set(textEncoder.encode(RECORD_MAGIC_TOMB), 0);
  // version u16 = 1
  header[4] = 0x01;
  header[5] = 0x00;
  // flags u16 = 0
  header[6] = 0x00;
  header[7] = 0x00;
  header.set(factIdBytes, 8);

  const crc = crc32Bytes(header);
  return new Uint8Array([...header, ...crc]);
}

function parseRecordType(recordBytes) {
  if (!recordBytes || recordBytes.length < 4) return null;
  return textDecoder.decode(recordBytes.slice(0, 4));
}

function extractFactIdFromRecord(recordBytes) {
  // Both FACT (DS007) and TOMB (DS012) place the 48-byte FactId at offset 8.
  if (!recordBytes || recordBytes.length < 8 + 48) return null;
  const idBytes = recordBytes.slice(8, 8 + 48);
  return base64urlEncode(idBytes);
}

function validateTombstoneRecord(recordBytes) {
  if (!recordBytes || recordBytes.length < 4 + 2 + 2 + 48 + 4) {
    throw new Error('Invalid tombstone length');
  }
  const payload = recordBytes.slice(0, recordBytes.length - 4);
  const crcExpected = recordBytes.slice(recordBytes.length - 4);
  const crcActual = crc32Bytes(payload);
  if (crcExpected[0] !== crcActual[0] ||
      crcExpected[1] !== crcActual[1] ||
      crcExpected[2] !== crcActual[2] ||
      crcExpected[3] !== crcActual[3]) {
    throw new Error('Tombstone CRC32 mismatch');
  }
  const version = payload[4] | (payload[5] << 8);
  if (version !== 1) {
    throw new Error(`Unsupported tombstone version ${version}`);
  }
}

/**
 * @typedef {{kind: 'fact'|'tombstone', offset: number, length: number}} IndexEntry
 */

export class FileStore extends StorageStrategy {
  constructor(config = {}) {
    super('file');

    const fileCfg = config?.storage?.file ?? {};

    const defaultPath = resolve(process.cwd(), '.vsavm', 'facts.bin');
    const path = fileCfg.path ? resolve(process.cwd(), fileCfg.path) : defaultPath;

    this.config = {
      path,
      indexMode: fileCfg.indexMode ?? 'full', // 'full' | 'none'
      cacheMaxEntries: Number.isFinite(fileCfg.cacheMaxEntries) ? fileCfg.cacheMaxEntries : 512
    };

    /** @type {import('node:fs/promises').FileHandle | null} */
    this.handle = null;
    this.appendOffset = 0;

    /** @type {Map<string, IndexEntry>} */
    this.index = new Map();
    this.liveCount = 0;

    /** @type {Map<string, Object>} */
    this.cache = new Map();

    this.snapshotCounter = 0;
    /** @type {Map<string, {dataOffset: number}>} */
    this.snapshots = new Map();
  }

  async initialize() {
    await mkdir(dirname(this.config.path), { recursive: true });
    this.handle = await open(this.config.path, 'a+');
    const stats = await this.handle.stat();
    this.appendOffset = stats.size;

    if (this.config.indexMode === 'full') {
      await this._rebuildIndex();
    }
  }

  async close() {
    this.cache.clear();
    this.index.clear();
    this.liveCount = 0;
    this.snapshots.clear();
    this.appendOffset = 0;

    if (this.handle) {
      await this.handle.close();
      this.handle = null;
    }
  }

  async assertFact(fact) {
    if (!this.handle) {
      throw new Error('FileStore not initialized');
    }
    const record = serializeFactInstanceBinary(fact);
    const lengthPrefix = encodeU32LE(record.length);

    const offset = this.appendOffset;
    await this.handle.write(lengthPrefix);
    await this.handle.write(record);
    this.appendOffset += 4 + record.length;

    // Update index/caches (last-write-wins).
    if (this.config.indexMode === 'full') {
      const prev = this.index.get(fact.factId);
      const wasLive = prev?.kind === 'fact';
      this.index.set(fact.factId, { kind: 'fact', offset, length: record.length });
      if (!wasLive) {
        this.liveCount += 1;
      }
    }

    this._cachePut(fact.factId, fact);
  }

  async denyFact(factId, scopeId) {
    if (!this.handle) {
      throw new Error('FileStore not initialized');
    }

    // Match MemoryStore semantics: deny only if scope contains existing fact scope.
    const existing = await this.getFact(factId);
    if (!existing) return;
    if (scopeId && existing.scopeId && !scopeContains(scopeId, existing.scopeId)) {
      return;
    }

    const record = encodeTombstoneRecord(factId);
    const lengthPrefix = encodeU32LE(record.length);
    const offset = this.appendOffset;

    await this.handle.write(lengthPrefix);
    await this.handle.write(record);
    this.appendOffset += 4 + record.length;

    if (this.config.indexMode === 'full') {
      const prev = this.index.get(factId);
      const wasLive = prev?.kind === 'fact';
      this.index.set(factId, { kind: 'tombstone', offset, length: record.length });
      if (wasLive) {
        this.liveCount = Math.max(0, this.liveCount - 1);
      }
    }

    this.cache.delete(factId);
  }

  async getFact(factId) {
    if (!this.handle) {
      throw new Error('FileStore not initialized');
    }

    const cached = this.cache.get(factId);
    if (cached) {
      this._cacheTouch(factId);
      return cached;
    }

    if (this.config.indexMode === 'full') {
      const entry = this.index.get(factId);
      if (!entry) return null;
      if (entry.kind === 'tombstone') return null;
      try {
        const fact = await this._readFactAt(entry.offset, entry.length);
        this._cachePut(factId, fact);
        return fact;
      } catch {
        return null;
      }
    }

    // Slow path: scan the file for the last occurrence of factId.
    const found = await this._scanForFactId(factId);
    if (found && found.kind === 'fact') {
      this._cachePut(factId, found.fact);
      return found.fact;
    }
    return null;
  }

  async query(pattern) {
    if (!this.handle) {
      throw new Error('FileStore not initialized');
    }

    // Streaming scan with last-write-wins for matching IDs only.
    const results = new Map();
    let position = 0;

    while (position + 4 <= this.appendOffset) {
      const lenBuf = await this._readBytes(position, 4);
      if (lenBuf.length < 4) break;
      const recLen = decodeU32LE(lenBuf);
      const recStart = position + 4;
      const recEnd = recStart + recLen;
      if (recEnd > this.appendOffset) break;

      const recBytes = await this._readBytes(recStart, recLen);
      const type = parseRecordType(recBytes);
      const factId = extractFactIdFromRecord(recBytes);
      if (!type || !factId) {
        position = recEnd;
        continue;
      }

      if (type === RECORD_MAGIC_TOMB) {
        try {
          validateTombstoneRecord(recBytes);
          results.delete(factId);
        } catch {
          // Ignore invalid tombstone and continue scanning.
        }
        position = recEnd;
        continue;
      }

      if (type !== RECORD_MAGIC_FACT) {
        position = recEnd;
        continue;
      }

      // Always decode: last-write-wins must account for non-matching overwrites
      // (e.g., same FactId with different scope/polarity).
      try {
        const fact = deserializeFactInstanceBinary(recBytes);
        if (this._matchesPattern(fact, pattern ?? {})) {
          results.set(fact.factId, fact);
        } else {
          results.delete(fact.factId);
        }
      } catch {
        // Skip corrupted FACT records.
      }

      position = recEnd;
    }

    return [...results.values()];
  }

  async queryByPredicate(predicate) {
    const predKey = typeof predicate === 'string' ? predicate : symbolIdToString(predicate);
    return this.query({ predicate: predKey });
  }

  async queryByScope(scopeId) {
    // MemoryStore queryByScope uses containment; match that behavior.
    return this.query({ scopeId });
  }

  async queryByTimeRange(start, end) {
    const startMs = start.getTime();
    const endMs = end.getTime();
    const results = [];

    let position = 0;
    while (position + 4 <= this.appendOffset) {
      const lenBuf = await this._readBytes(position, 4);
      if (lenBuf.length < 4) break;
      const recLen = decodeU32LE(lenBuf);
      const recStart = position + 4;
      const recEnd = recStart + recLen;
      if (recEnd > this.appendOffset) break;

      const recBytes = await this._readBytes(recStart, recLen);
      const type = parseRecordType(recBytes);
      if (type === RECORD_MAGIC_FACT) {
        try {
          const fact = deserializeFactInstanceBinary(recBytes);
          if (!fact.time) {
            position = recEnd;
            continue;
          }
          const factStart = fact.time.instant ?? fact.time.start ?? -Infinity;
          const factEnd = fact.time.instant ?? fact.time.end ?? Infinity;
          if (factStart <= endMs && factEnd >= startMs) {
            results.push(fact);
          }
        } catch {
          // Skip corrupted record.
        }
      }

      position = recEnd;
    }

    return results;
  }

  async getAllFacts() {
    if (this.config.indexMode === 'full') {
      const facts = [];
      for (const [factId, entry] of this.index) {
        if (entry.kind !== 'fact') continue;
        const fact = await this._readFactAt(entry.offset, entry.length);
        facts.push(fact);
        this._cachePut(factId, fact);
      }
      return facts;
    }

    // Fallback: scan the log and return last-write-wins facts (can be memory heavy).
    return this.query({});
  }

  async findConflicting(fact) {
    // Conflict check only needs the current stored fact with the same factId (if any).
    const existing = await this.getFact(fact.factId);
    if (!existing) return [];
    if (factsConflict(fact, existing) && timeOverlaps(fact.time, existing.time)) {
      return [existing];
    }
    return [];
  }

  async createSnapshot() {
    this.snapshotCounter += 1;
    const id = stableSnapshotId(this.snapshotCounter);
    this.snapshots.set(id, { dataOffset: this.appendOffset });
    return id;
  }

  async restoreSnapshot(snapshotId) {
    if (!this.handle) {
      throw new Error('FileStore not initialized');
    }
    const snap = this.snapshots.get(snapshotId);
    if (!snap) {
      throw new Error(`Snapshot not found: ${snapshotId}`);
    }

    await this.handle.truncate(snap.dataOffset);
    this.appendOffset = snap.dataOffset;
    this.cache.clear();

    if (this.config.indexMode === 'full') {
      await this._rebuildIndex();
    }
  }

  async count() {
    if (this.config.indexMode === 'full') {
      return this.liveCount;
    }

    // Slow fallback: scan and count unique factIds in last-write-wins state.
    const all = await this.getAllFacts();
    return all.length;
  }

  async clear() {
    if (!this.handle) {
      throw new Error('FileStore not initialized');
    }
    await this.handle.truncate(0);
    this.appendOffset = 0;
    this.index.clear();
    this.cache.clear();
    this.liveCount = 0;
    this.snapshots.clear();
    this.snapshotCounter = 0;
  }

  async _rebuildIndex() {
    if (!this.handle) {
      throw new Error('FileStore not initialized');
    }
    this.index.clear();
    this.cache.clear();
    this.liveCount = 0;

    let position = 0;
    const size = this.appendOffset;
    while (position + 4 <= size) {
      const lenBuf = await this._readBytes(position, 4);
      if (lenBuf.length < 4) break;
      const recLen = decodeU32LE(lenBuf);
      const recStart = position + 4;
      const recEnd = recStart + recLen;
      if (recLen <= 0 || recEnd > size) break;

      const recBytes = await this._readBytes(recStart, recLen);
      const type = parseRecordType(recBytes);
      const factId = extractFactIdFromRecord(recBytes);
      if (!type || !factId) {
        position = recEnd;
        continue;
      }

      if (type === RECORD_MAGIC_TOMB) {
        try {
          validateTombstoneRecord(recBytes);
          const prev = this.index.get(factId);
          if (prev?.kind === 'fact') {
            this.liveCount = Math.max(0, this.liveCount - 1);
          }
          this.index.set(factId, { kind: 'tombstone', offset: position, length: recLen });
        } catch {
          // Ignore invalid tombstone record.
        }
        position = recEnd;
        continue;
      }

      if (type !== RECORD_MAGIC_FACT) {
        position = recEnd;
        continue;
      }

      const prev = this.index.get(factId);
      const wasLive = prev?.kind === 'fact';
      this.index.set(factId, { kind: 'fact', offset: position, length: recLen });
      if (!wasLive) {
        this.liveCount += 1;
      }

      position = recEnd;
    }
  }

  async _readFactAt(recordOffset, recordLength) {
    // recordOffset points at the 4-byte length prefix.
    const payloadOffset = recordOffset + 4;
    const bytes = await this._readBytes(payloadOffset, recordLength);
    return deserializeFactInstanceBinary(bytes);
  }

  async _readBytes(position, length) {
    if (!this.handle) {
      throw new Error('FileStore not initialized');
    }
    const buf = Buffer.alloc(length);
    const { bytesRead } = await this.handle.read(buf, 0, length, position);
    return buf.slice(0, bytesRead);
  }

  _cacheTouch(factId) {
    const value = this.cache.get(factId);
    if (!value) return;
    this.cache.delete(factId);
    this.cache.set(factId, value);
  }

  _cachePut(factId, fact) {
    if (!fact || this.config.cacheMaxEntries <= 0) return;
    if (this.cache.has(factId)) {
      this.cache.delete(factId);
    }
    this.cache.set(factId, fact);
    while (this.cache.size > this.config.cacheMaxEntries) {
      const firstKey = this.cache.keys().next().value;
      this.cache.delete(firstKey);
    }
  }

  _matchesPattern(fact, pattern) {
    if (!pattern) return true;

    // Match predicate
    if (pattern.predicate) {
      const factPred = symbolIdToString(fact.predicate);
      const patternPred = typeof pattern.predicate === 'string'
        ? pattern.predicate
        : symbolIdToString(pattern.predicate);
      if (factPred !== patternPred) return false;
    }

    // Match polarity
    if (pattern.polarity && fact.polarity !== pattern.polarity) {
      return false;
    }

    // Match scope (exact match)
    if (pattern.scope) {
      const a = JSON.stringify(fact.scopeId?.path ?? []);
      const b = JSON.stringify(pattern.scope?.path ?? []);
      if (a !== b) return false;
    }

    // Match scopeId containment
    if (pattern.scopeId && !scopeContains(pattern.scopeId, fact.scopeId)) {
      return false;
    }

    // Match arguments
    if (pattern.arguments) {
      for (const [slot, value] of Object.entries(pattern.arguments)) {
        if (!fact.arguments.has(slot)) return false;
        const factValue = fact.arguments.get(slot);

        const looksLikeTerm = (v) => isAtom(v) || isStruct(v);
        if (looksLikeTerm(factValue) || looksLikeTerm(value)) {
          if (!termsEqual(factValue, value)) return false;
        } else if (JSON.stringify(factValue) !== JSON.stringify(value)) {
          return false;
        }
      }
    }

    return true;
  }

  async _scanForFactId(targetFactId) {
    let position = 0;
    /** @type {{kind:'fact'|'tombstone', fact?: Object} | null} */
    let found = null;

    while (position + 4 <= this.appendOffset) {
      const lenBuf = await this._readBytes(position, 4);
      if (lenBuf.length < 4) break;
      const recLen = decodeU32LE(lenBuf);
      const recStart = position + 4;
      const recEnd = recStart + recLen;
      if (recEnd > this.appendOffset) break;

      const recBytes = await this._readBytes(recStart, recLen);
      const type = parseRecordType(recBytes);
      const factId = extractFactIdFromRecord(recBytes);
      if (!type || !factId || factId !== targetFactId) {
        position = recEnd;
        continue;
      }

      if (type === RECORD_MAGIC_TOMB) {
        try {
          validateTombstoneRecord(recBytes);
          found = { kind: 'tombstone' };
        } catch {
          // Ignore invalid tombstone.
        }
      } else if (type === RECORD_MAGIC_FACT) {
        const fact = deserializeFactInstanceBinary(recBytes);
        found = { kind: 'fact', fact };
      }

      position = recEnd;
    }

    return found;
  }
}

export default FileStore;
