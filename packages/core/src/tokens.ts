/** GPT-style heuristic: ~4 chars per token */
export function estimateTokens(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}

export function redactSecrets(text: string): string {
  return text
    .replace(/(api[_-]?key|password|secret|token)\s*[=:]\s*\S+/gi, '$1=[REDACTED]')
    .replace(/Bearer\s+\S+/gi, 'Bearer [REDACTED]');
}
