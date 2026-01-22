/**
 * Next-Phrase Prediction with VM State Conditioning
 * Core DS005 outer loop implementation
 */

/**
 * Simple phrase-based language model conditioned on VM state
 */
export class VMConditionedLanguageModel {
  constructor() {
    this.phrasePatterns = new Map();
    this.vmStatePatterns = new Map();
    this.contextWindow = 5;
  }

  /**
   * Train on phrase sequences with VM state context
   */
  async train(trainingData) {
    for (const example of trainingData) {
      const { phrases, vmStates } = example;
      
      for (let i = 0; i < phrases.length - 1; i++) {
        const context = phrases.slice(Math.max(0, i - this.contextWindow), i);
        const nextPhrase = phrases[i + 1];
        const vmState = vmStates[i];
        
        // Learn phrase transitions
        const contextKey = JSON.stringify(context);
        if (!this.phrasePatterns.has(contextKey)) {
          this.phrasePatterns.set(contextKey, new Map());
        }
        
        const transitions = this.phrasePatterns.get(contextKey);
        transitions.set(nextPhrase, (transitions.get(nextPhrase) || 0) + 1);
        
        // Learn VM state influence
        const stateKey = this.encodeVMState(vmState);
        if (!this.vmStatePatterns.has(stateKey)) {
          this.vmStatePatterns.set(stateKey, new Map());
        }
        
        const stateTransitions = this.vmStatePatterns.get(stateKey);
        stateTransitions.set(nextPhrase, (stateTransitions.get(nextPhrase) || 0) + 1);
      }
    }
  }

  /**
   * Predict next phrase conditioned on context and VM state
   */
  async predictNextPhrase(context, vmState) {
    const contextKey = JSON.stringify(context.slice(-this.contextWindow));
    const stateKey = this.encodeVMState(vmState);
    
    // Get phrase predictions from context
    const contextPredictions = this.phrasePatterns.get(contextKey) || new Map();
    
    // Get phrase predictions from VM state
    const statePredictions = this.vmStatePatterns.get(stateKey) || new Map();
    
    // Combine predictions (weighted average)
    const combined = new Map();
    const contextWeight = 0.6;
    const stateWeight = 0.4;
    
    // Add context predictions
    for (const [phrase, count] of contextPredictions) {
      combined.set(phrase, (combined.get(phrase) || 0) + count * contextWeight);
    }
    
    // Add state predictions
    for (const [phrase, count] of statePredictions) {
      combined.set(phrase, (combined.get(phrase) || 0) + count * stateWeight);
    }
    
    if (combined.size === 0) {
      return { phrase: '<unknown>', confidence: 0 };
    }
    
    // Find best prediction
    let bestPhrase = '';
    let bestScore = 0;
    let totalScore = 0;
    
    for (const [phrase, score] of combined) {
      totalScore += score;
      if (score > bestScore) {
        bestScore = score;
        bestPhrase = phrase;
      }
    }
    
    return {
      phrase: bestPhrase,
      confidence: bestScore / totalScore,
      alternatives: Array.from(combined.entries())
        .sort((a, b) => b[1] - a[1])
        .slice(0, 3)
        .map(([phrase, score]) => ({ phrase, confidence: score / totalScore }))
    };
  }

  /**
   * Encode VM state into compact representation
   */
  encodeVMState(vmState) {
    if (!vmState) return 'empty';
    
    const encoding = {
      factCount: vmState.facts?.length || 0,
      ruleCount: vmState.rules?.length || 0,
      contextDepth: vmState.contextStack?.length || 0,
      budgetUsed: vmState.budget?.used?.steps || 0
    };
    
    return JSON.stringify(encoding);
  }

  /**
   * Generate text conditioned on VM state
   */
  async generateText(prompt, vmState, maxPhrases = 10) {
    const phrases = prompt.split(/\s+/);
    const generated = [...phrases];
    
    for (let i = 0; i < maxPhrases; i++) {
      const context = generated.slice(-this.contextWindow);
      const prediction = await this.predictNextPhrase(context, vmState);
      
      if (prediction.confidence < 0.1) break; // Stop if low confidence
      
      generated.push(prediction.phrase);
    }
    
    return {
      text: generated.join(' '),
      phrases: generated,
      vmStateInfluence: this.encodeVMState(vmState)
    };
  }
}

export default VMConditionedLanguageModel;
