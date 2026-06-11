import { smartCompress } from '../compressors.js';
import { redactSecrets, shouldCompress } from '../security.js';
import { estimateTokens } from '../tokens.js';

export interface CompressResult {
  output: string;
  tokensRaw: number;
  tokensOptimized: number;
  compressed: boolean;
}

export function compressShellOutput(command: string, output: string): CompressResult {
  const safe = redactSecrets(output);
  const tokensRaw = estimateTokens(safe);
  if (!safe.trim()) {
    return { output: safe, tokensRaw, tokensOptimized: tokensRaw, compressed: false };
  }

  if (!shouldCompress(command, safe)) {
    return { output: safe, tokensRaw, tokensOptimized: tokensRaw, compressed: false };
  }

  const compressed = redactSecrets(smartCompress(command, safe));
  const tokensOptimized = estimateTokens(compressed);
  const didCompress = compressed !== safe && tokensOptimized < tokensRaw;

  return {
    output: didCompress ? compressed : safe,
    tokensRaw,
    tokensOptimized: didCompress ? tokensOptimized : tokensRaw,
    compressed: didCompress,
  };
}
