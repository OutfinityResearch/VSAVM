/**
 * Scope tree for structural context paths.
 * Provides basic hierarchical management of scopes.
 */

import { createScopeId } from '../../core/types/identifiers.mjs';

class ScopeNode {
  constructor(segment, parent = null) {
    this.segment = segment;
    this.parent = parent;
    this.children = new Map();
    this.scopeId = null;
  }

  path() {
    const parts = [];
    let current = this;
    while (current && current.segment !== null) {
      parts.push(current.segment);
      current = current.parent;
    }
    return parts.reverse();
  }
}

/**
 * ScopeTree manages hierarchical structural scopes.
 */
export class ScopeTree {
  constructor() {
    this.root = new ScopeNode(null);
  }

  /**
   * Add a context path to the tree and return its ScopeId.
   * @param {string[]} path
   * @returns {{path: string[]}}
   */
  addPath(path) {
    const segments = Array.isArray(path) ? path : [path];
    let current = this.root;

    for (const segment of segments) {
      const key = String(segment);
      if (!current.children.has(key)) {
        current.children.set(key, new ScopeNode(key, current));
      }
      current = current.children.get(key);
    }

    if (!current.scopeId) {
      current.scopeId = createScopeId(current.path());
    }

    return current.scopeId;
  }

  /**
   * Get a node for a given path.
   * @param {string[]} path
   * @returns {ScopeNode|null}
   */
  getNode(path) {
    const segments = Array.isArray(path) ? path : [path];
    let current = this.root;

    for (const segment of segments) {
      const key = String(segment);
      const next = current.children.get(key);
      if (!next) return null;
      current = next;
    }

    return current;
  }

  /**
   * Check if a path exists in the tree.
   * @param {string[]} path
   * @returns {boolean}
   */
  hasPath(path) {
    return this.getNode(path) !== null;
  }

  /**
   * List all paths in the tree.
   * @returns {string[][]}
   */
  listPaths() {
    const paths = [];

    const visit = (node) => {
      if (node.scopeId) {
        paths.push(node.path());
      }
      for (const child of node.children.values()) {
        visit(child);
      }
    };

    visit(this.root);
    return paths;
  }
}

export default {
  ScopeTree
};
