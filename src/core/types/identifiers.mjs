/**
 * Identifier types for VSAVM
 * Per DS007: SymbolId, EntityId, FactId, ScopeId, SourceId
 */

/**
 * Create a SymbolId (canonical identifier for predicates, roles, enum values)
 * @param {string} namespace - e.g., "vsavm.core", "domain.medical"
 * @param {string} name - e.g., "is_a", "located_in"
 * @returns {{namespace: string, name: string}}
 */
export function createSymbolId(namespace, name) {
  return { namespace, name };
}

/**
 * Convert SymbolId to string representation
 * @param {{namespace: string, name: string}} symbolId
 * @returns {string} "namespace:name"
 */
export function symbolIdToString(symbolId) {
  return `${symbolId.namespace}:${symbolId.name}`;
}

/**
 * Parse string to SymbolId
 * @param {string} str - "namespace:name"
 * @returns {{namespace: string, name: string}}
 */
export function parseSymbolId(str) {
  const idx = str.indexOf(':');
  if (idx === -1) {
    return { namespace: 'vsavm.core', name: str };
  }
  return {
    namespace: str.slice(0, idx),
    name: str.slice(idx + 1)
  };
}

/**
 * Create an EntityId (canonical identifier for entities)
 * @param {string} source - Origin system/dataset
 * @param {string} localId - ID within source
 * @param {number} [version] - Optional version for mutable entities
 * @returns {{source: string, localId: string, version?: number}}
 */
export function createEntityId(source, localId, version = undefined) {
  const id = { source, localId };
  if (version !== undefined) {
    id.version = version;
  }
  return id;
}

/**
 * Convert EntityId to string representation
 * @param {{source: string, localId: string, version?: number}} entityId
 * @returns {string} "source/localId" or "source/localId@version"
 */
export function entityIdToString(entityId) {
  let str = `${entityId.source}/${entityId.localId}`;
  if (entityId.version !== undefined) {
    str += `@${entityId.version}`;
  }
  return str;
}

/**
 * Parse string to EntityId
 * @param {string} str - "source/localId" or "source/localId@version"
 * @returns {{source: string, localId: string, version?: number}}
 */
export function parseEntityId(str) {
  const atIdx = str.lastIndexOf('@');
  let base = str;
  let version;
  
  if (atIdx !== -1) {
    base = str.slice(0, atIdx);
    version = parseInt(str.slice(atIdx + 1), 10);
  }
  
  const slashIdx = base.indexOf('/');
  if (slashIdx === -1) {
    return { source: 'internal', localId: base, version };
  }
  
  return {
    source: base.slice(0, slashIdx),
    localId: base.slice(slashIdx + 1),
    version
  };
}

/**
 * Create a ScopeId from context path with validation
 * @param {string[]} path - e.g., ["doc_001", "section_2", "para_1"]
 * @returns {{path: string[]}}
 * @throws {Error} If path contains hardcoded domain patterns
 */
export function createScopeId(path) {
  const pathArray = Array.isArray(path) ? path : [path];
  
  // CRITICAL: Reject hardcoded domain scopes - any ['domain', X] pattern is forbidden
  if (pathArray.length >= 2 && pathArray[0] === 'domain') {
    throw new Error(`Hardcoded domain scope rejected: ${JSON.stringify(pathArray)}. Use structural separators instead.`);
  }
  
  return { path: pathArray };
}

/**
 * Convert ScopeId to string representation
 * @param {{path: string[]}} scopeId
 * @returns {string} "doc_001/section_2/para_1"
 */
export function scopeIdToString(scopeId) {
  return scopeId.path.join('/');
}

/**
 * Parse string to ScopeId
 * @param {string} str - "doc_001/section_2/para_1"
 * @returns {{path: string[]}}
 */
export function parseScopeId(str) {
  return { path: str.split('/').filter(p => p.length > 0) };
}

/**
 * Check if scopeA is ancestor of or equal to scopeB
 * @param {{path: string[]}} scopeA
 * @param {{path: string[]}} scopeB
 * @returns {boolean}
 */
export function scopeContains(scopeA, scopeB) {
  if (scopeA.path.length > scopeB.path.length) return false;
  for (let i = 0; i < scopeA.path.length; i++) {
    if (scopeA.path[i] !== scopeB.path[i]) return false;
  }
  return true;
}

/**
 * Create a SourceId (provenance identifier)
 * @param {'document' | 'speaker' | 'sensor' | 'derived' | 'user'} type
 * @param {string} id
 * @param {Object<string, string>} [metadata]
 * @returns {{type: string, id: string, metadata?: Object<string, string>}}
 */
export function createSourceId(type, id, metadata = undefined) {
  const sourceId = { type, id };
  if (metadata !== undefined) {
    sourceId.metadata = metadata;
  }
  return sourceId;
}

/**
 * Convert SourceId to string representation
 * @param {{type: string, id: string}} sourceId
 * @returns {string} "type:id"
 */
export function sourceIdToString(sourceId) {
  return `${sourceId.type}:${sourceId.id}`;
}

/**
 * Parse string to SourceId
 * @param {string} str - "type:id"
 * @returns {{type: string, id: string}}
 */
export function parseSourceId(str) {
  const idx = str.indexOf(':');
  if (idx === -1) {
    return { type: 'document', id: str };
  }
  return {
    type: str.slice(0, idx),
    id: str.slice(idx + 1)
  };
}

// Reserved namespaces
export const RESERVED_NAMESPACES = {
  CORE: 'vsavm.core',
  META: 'vsavm.meta',
  TEMP: 'vsavm.temp'
};
