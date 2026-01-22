/**
 * Event Stream module index
 */

export { TextParser, parseText } from './parser/text-parser.mjs';
export { ingestEvents, ingestText } from './ingest.mjs';
export { fromAudioTranscript, fromVisualTokens, fromVideoSegments } from './parser/multimodal-adapter.mjs';
export { scopeIdFromContextPath, scopeIdFromEvent, extendContextPath, ScopeTree } from './scope/index.mjs';
