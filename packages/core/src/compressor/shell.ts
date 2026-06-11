import { smartCompress } from '../compressors.js';
import { estimateTokens } from '../tokens.js';

export interface CompressResult {
  output: string;
  tokensRaw: number;
  tokensOptimized: number;
  compressed: boolean;
}

export function compressShellOutput(command: string, output: string): CompressResult {
  const tokensRaw = estimateTokens(output);
  if (!output.trim()) {
    return { output, tokensRaw, tokensOptimized: tokensRaw, compressed: false };
  }

  const compressed = smartCompress(command, output);
  const tokensOptimized = estimateTokens(compressed);
  const didCompress = compressed !== output && tokensOptimized < tokensRaw;

  return {
    output: didCompress ? compressed : output,
    tokensRaw,
    tokensOptimized: didCompress ? tokensOptimized : tokensRaw,
    compressed: didCompress,
  };
}
