/**
 * Rule Store
 * Simple in-memory rule library for VM execution.
 */

export class RuleStore {
  constructor() {
    this.rules = [];
  }

  addRule(rule) {
    if (!rule) return null;
    this.rules.push(rule);
    return rule;
  }

  getRules() {
    return [...this.rules];
  }

  clear() {
    this.rules = [];
  }
}

export function createRuleStore() {
  return new RuleStore();
}

export default {
  RuleStore,
  createRuleStore
};
