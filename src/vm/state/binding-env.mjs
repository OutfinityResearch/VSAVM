/**
 * Variable binding environment for VM
 * Per DS006: Binding stack for variable values during execution
 */

/**
 * Binding environment with lexical scoping
 */
export class BindingEnv {
  constructor() {
    // Stack of scopes, each scope is a Map
    this.scopes = [new Map()];
  }

  /**
   * Get current scope depth
   * @returns {number}
   */
  get depth() {
    return this.scopes.length;
  }

  /**
   * Push a new scope
   */
  pushScope() {
    this.scopes.push(new Map());
  }

  /**
   * Pop the current scope
   * @returns {Map} The popped scope
   */
  popScope() {
    if (this.scopes.length <= 1) {
      throw new Error('Cannot pop root scope');
    }
    return this.scopes.pop();
  }

  /**
   * Bind a variable in current scope
   * @param {string} name
   * @param {*} value
   */
  bind(name, value) {
    this.scopes[this.scopes.length - 1].set(name, value);
  }

  /**
   * Bind multiple variables
   * @param {Object} bindings - name → value
   */
  bindAll(bindings) {
    const scope = this.scopes[this.scopes.length - 1];
    for (const [name, value] of Object.entries(bindings)) {
      scope.set(name, value);
    }
  }

  /**
   * Get a variable value (searches up scope chain)
   * @param {string} name
   * @returns {*} The value or undefined
   */
  get(name) {
    // Search from innermost to outermost scope
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        return this.scopes[i].get(name);
      }
    }
    return undefined;
  }

  /**
   * Check if a variable is bound
   * @param {string} name
   * @returns {boolean}
   */
  has(name) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        return true;
      }
    }
    return false;
  }

  /**
   * Update a variable (must exist)
   * @param {string} name
   * @param {*} value
   * @returns {boolean} True if updated
   */
  update(name, value) {
    for (let i = this.scopes.length - 1; i >= 0; i--) {
      if (this.scopes[i].has(name)) {
        this.scopes[i].set(name, value);
        return true;
      }
    }
    return false;
  }

  /**
   * Get all bindings visible from current scope
   * @returns {Map}
   */
  getAll() {
    const result = new Map();
    // Collect from outermost to innermost (inner overrides outer)
    for (const scope of this.scopes) {
      for (const [name, value] of scope) {
        result.set(name, value);
      }
    }
    return result;
  }

  /**
   * Get bindings in current (innermost) scope only
   * @returns {Map}
   */
  getCurrentScope() {
    return new Map(this.scopes[this.scopes.length - 1]);
  }

  /**
   * Clear all bindings
   */
  clear() {
    this.scopes = [new Map()];
  }

  /**
   * Get all bindings as plain object
   * @returns {Object}
   */
  getAllBindings() {
    const all = this.getAll();
    const result = {};
    for (const [name, value] of all) {
      result[name] = value;
    }
    return result;
  }

  /**
   * Create a snapshot of current state
   * @returns {Object}
   */
  snapshot() {
    return {
      scopes: this.scopes.map(s => new Map(s))
    };
  }

  /**
   * Restore from snapshot
   * @param {Object} snap
   */
  restore(snap) {
    this.scopes = snap.scopes.map(s => new Map(s));
  }

  /**
   * Clone the binding environment
   * @returns {BindingEnv}
   */
  clone() {
    const env = new BindingEnv();
    env.scopes = this.scopes.map(s => new Map(s));
    return env;
  }
}
