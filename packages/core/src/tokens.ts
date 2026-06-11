export { redactSecrets } from './security.js';

/** GPT-style heuristic: ~4 chars per token */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
