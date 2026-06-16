import { estimateTokens } from '../tokens.js';
import type { CompressionLevel } from '../compressors.js';

/** Pick compression strength from output size — larger output → stronger compression. */
export function resolveCompressionLevel(tokens: number, lineCount: number): CompressionLevel {
  if (tokens >= 6000 || lineCount >= 400) return 'emergency';
  if (tokens >= 2500 || lineCount >= 150) return 'aggressive';
  if (tokens >= 1200 || lineCount >= 80) return 'aggressive';
  return 'normal';
}

export function shouldEscalateCompression(
  tokensRaw: number,
  tokensOptimized: number,
  level: CompressionLevel
): boolean {
  if (level === 'emergency') return false;
  if (tokensRaw < 800) return false;
  const savingsRatio = (tokensRaw - tokensOptimized) / tokensRaw;
  return savingsRatio < 0.35;
}

export function nextCompressionLevel(level: CompressionLevel): CompressionLevel {
  if (level === 'normal') return 'aggressive';
  if (level === 'aggressive') return 'emergency';
  return 'emergency';
}

export function estimateOutputSize(output: string): { tokens: number; lines: number } {
  return {
    tokens: estimateTokens(output),
    lines: output.split('\n').length,
  };
}
