/**
 * Text Parser for Event Stream
 * Per DS006: Converts text input to event stream
 */

import { 
  EventStream, 
  EventType, 
  SeparatorLevel,
  createTextTokenPayload,
  createSeparatorPayload,
  createHeaderPayload
} from '../../core/types/events.mjs';
import { createSourceId } from '../../core/types/identifiers.mjs';
import { computeHash } from '../../core/hash.mjs';

/**
 * Simple text parser that tokenizes input and detects structure
 */
export class TextParser {
  constructor(options = {}) {
    this.options = {
      // Legacy heuristics are opt-in to keep separator discovery emergent.
      detectHeaders: options.detectHeaders ?? false,
      detectParagraphs: options.detectParagraphs ?? false,
      detectSentences: options.detectSentences ?? false,
      lowercase: options.lowercase ?? false,
      emitSeparators: options.emitSeparators ?? false,
      ...options
    };
  }

  /**
   * Parse text into an event stream
   * @param {string} text
   * @param {Object} [options]
   * @param {string} [options.sourceId]
   * @param {Object} [options.metadata]
   * @returns {EventStream}
   */
  parse(text, options = {}) {
    const sourceId = options.sourceId 
      ? createSourceId('document', options.sourceId)
      : createSourceId('document', `text_${computeHash(String(text ?? ''))}`);
    
    const stream = new EventStream({
      sourceId,
      metadata: options.metadata || {}
    });
    
    // Push document-level context
    stream.pushContext('doc');
    
    // Split into paragraphs
    const paragraphs = this.splitParagraphs(text);
    
    for (let pIdx = 0; pIdx < paragraphs.length; pIdx++) {
      const para = paragraphs[pIdx];
      if (!para.trim()) continue;
      
      stream.pushContext(`p${pIdx}`);
      
      // Check if this is a header
      const headerMatch = this.detectHeader(para);
      if (headerMatch) {
        stream.push(EventType.HEADER, createHeaderPayload(headerMatch.level, headerMatch.text));
        if (this.options.emitSeparators) {
          stream.push(EventType.SEPARATOR, createSeparatorPayload(SeparatorLevel.SECTION, headerMatch.text));
        }
        stream.popContext();
        continue;
      }
      
      // Split into sentences
      const sentences = this.splitSentences(para);
      
      for (let sIdx = 0; sIdx < sentences.length; sIdx++) {
        const sentence = sentences[sIdx];
        if (!sentence.trim()) continue;
        
        stream.pushContext(`s${sIdx}`);
        
        // Tokenize
        const tokens = this.tokenize(sentence);
        for (const token of tokens) {
          stream.push(
            EventType.TEXT_TOKEN,
            createTextTokenPayload(
              this.options.lowercase ? token.toLowerCase() : token,
              { originalForm: token }
            )
          );
        }
        
        // Sentence separator
        if (this.options.emitSeparators && sIdx < sentences.length - 1) {
          stream.push(EventType.SEPARATOR, createSeparatorPayload(SeparatorLevel.SENTENCE));
        }
        
        stream.popContext();
      }
      
      // Paragraph separator
      if (this.options.emitSeparators && pIdx < paragraphs.length - 1) {
        stream.push(EventType.SEPARATOR, createSeparatorPayload(SeparatorLevel.PARAGRAPH));
      }
      
      stream.popContext();
    }
    
    stream.popContext();
    
    return stream;
  }

  /**
   * Split text into paragraphs
   * @param {string} text
   * @returns {string[]}
   */
  splitParagraphs(text) {
    if (!this.options.detectParagraphs) {
      return [text];
    }
    return text.split(/\n\s*\n/).filter(p => p.trim());
  }

  /**
   * Split text into sentences
   * @param {string} text
   * @returns {string[]}
   */
  splitSentences(text) {
    if (!this.options.detectSentences) {
      return [text];
    }
    // Simple sentence splitting on . ! ?
    // Handles common abbreviations
    const sentences = [];
    let current = '';
    
    const abbrevs = new Set(['mr', 'mrs', 'ms', 'dr', 'prof', 'sr', 'jr', 'vs', 'etc', 'e.g', 'i.e']);
    
    for (let i = 0; i < text.length; i++) {
      current += text[i];
      
      if ('.!?'.includes(text[i])) {
        // Check if this is end of sentence
        const nextChar = text[i + 1];
        const prevWord = current.trim().split(/\s+/).pop()?.toLowerCase().replace(/[.!?]/g, '');
        
        if (!abbrevs.has(prevWord) && (!nextChar || /\s/.test(nextChar))) {
          sentences.push(current.trim());
          current = '';
        }
      }
    }
    
    if (current.trim()) {
      sentences.push(current.trim());
    }
    
    return sentences;
  }

  /**
   * Tokenize text into words
   * @param {string} text
   * @returns {string[]}
   */
  tokenize(text) {
    // Split on whitespace and punctuation, keeping punctuation as separate tokens
    return text
      .split(/(\s+|[.,!?;:'"()\[\]{}])/)
      .filter(t => t.trim())
      .map(t => t.trim());
  }

  /**
   * Detect if text is a header
   * @param {string} text
   * @returns {{level: number, text: string} | null}
   */
  detectHeader(text) {
    if (!this.options.detectHeaders) return null;
    
    // Markdown-style headers
    const mdMatch = text.match(/^(#{1,6})\s+(.+)$/);
    if (mdMatch) {
      return {
        level: mdMatch[1].length,
        text: mdMatch[2].trim()
      };
    }
    
    // All-caps short lines
    if (text.length < 100 && text === text.toUpperCase() && /^[A-Z\s]+$/.test(text)) {
      return {
        level: 2,
        text: text.trim()
      };
    }
    
    return null;
  }
}

/**
 * Convenience function to parse text
 * @param {string} text
 * @param {Object} [options]
 * @returns {EventStream}
 */
export function parseText(text, options = {}) {
  const parser = new TextParser(options);
  return parser.parse(text, options);
}
