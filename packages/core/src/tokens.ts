export { redactSecrets } from './security.js';

type ContentType = 'code' | 'prose' | 'data' | 'mixed';

function detectContentType(text: string): ContentType {
  const sample = text.slice(0, 500);

  // JSON/XML/YAML = data
  if (/^\s*[{\[]/.test(sample) || /^\s*<\?xml/.test(sample) || /^[\w-]+:\s*[\w-]+$/m.test(sample)) {
    return 'data';
  }

  // Code indicators
  const codePatterns = [
    /\b(function|const|let|var|class|import|export|return|if|else|for|while)\b/,
    /[{};()[\]]/g,
    /=>/,
    /\b(def|class|import|from|async|await)\b/,
  ];
  const codeMatches = codePatterns.reduce(
    (count, pattern) => count + (sample.match(pattern)?.length || 0),
    0
  );

  // Natural language indicators
  const prosePatterns = [
    /\b(the|is|are|was|were|been|have|has|will|would|should|could)\b/gi,
    /[.!?]\s+[A-Z]/g,
  ];
  const proseMatches = prosePatterns.reduce(
    (count, pattern) => count + (sample.match(pattern)?.length || 0),
    0
  );

  if (codeMatches > proseMatches * 1.5) return 'code';
  if (proseMatches > codeMatches * 1.5) return 'prose';
  return 'mixed';
}

/** Smart token estimation based on content type */
export function estimateTokens(text: string): number {
  if (!text) return 0;

  const type = detectContentType(text);

  // Adjusted ratios based on empirical testing
  const charsPerToken: Record<ContentType, number> = {
    code: 3.5, // Code is denser (keywords, symbols)
    prose: 4.0, // Standard English text
    data: 5.5, // JSON/structured data (keys, quotes, brackets)
    mixed: 4.2, // Conservative average
  };

  return Math.ceil(text.length / charsPerToken[type]);
}

/** Legacy simple estimation for backward compatibility */
export function estimateTokensSimple(text: string): number {
  if (!text) return 0;
  return Math.ceil(text.length / 4);
}
