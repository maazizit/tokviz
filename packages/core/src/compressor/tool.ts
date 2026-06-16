import { smartCompress } from '../compressors.js';
import { selectImportantLines, truncateLines } from '../noise.js';
import { shouldCompress } from '../security.js';
import { estimateTokens, redactSecrets } from '../tokens.js';
import { estimateOutputSize } from './adaptive.js';

export interface ToolCompressResult {
  output: string;
  tokensRaw: number;
  tokensOptimized: number;
  compressed: boolean;
  compressor: string;
}

function tryParseJson(output: string): unknown | null {
  const trimmed = output.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function compactJson(value: unknown): string {
  return JSON.stringify(value);
}

function sampleJsonArray(data: unknown[], maxItems: number, keepFields?: string[]): string {
  const sample = data.slice(0, maxItems).map((item) => {
    if (!keepFields || typeof item !== 'object' || item === null) return item;
    const out: Record<string, unknown> = {};
    for (const key of keepFields) {
      if (key in item) out[key] = (item as Record<string, unknown>)[key];
    }
    return Object.keys(out).length > 0 ? out : item;
  });
  return compactJson({
    _tokviz: `${data.length} items, showing ${sample.length}`,
    items: sample,
  });
}

function compressFileContent(output: string): string {
  const lines = output.split('\n');
  if (lines.length <= 60) return output;
  const head = lines.slice(0, 25);
  const tail = lines.slice(-10);
  return [
    ...head,
    `… [tokviz: ${lines.length - 35} lines omitted] …`,
    ...tail,
  ].join('\n');
}

function compressGitHubLike(toolName: string, output: string): string | null {
  const normalized = toolName.toLowerCase();
  const json = tryParseJson(output);

  if (json && Array.isArray(json)) {
    return sampleJsonArray(json, 3, ['title', 'name', 'path', 'url', 'number', 'state']);
  }

  if (json && typeof json === 'object' && json !== null) {
    const obj = json as Record<string, unknown>;
    if (Array.isArray(obj.items)) {
      return sampleJsonArray(obj.items, 3, ['title', 'name', 'path', 'url', 'number', 'state']);
    }
    if (typeof obj.content === 'string' && obj.content.length > 1500) {
      const content = obj.content as string;
      return compactJson({
        title: obj.title ?? obj.name,
        path: obj.path,
        content: compressFileContent(content),
        _tokviz: `content truncated from ${content.split('\n').length} lines`,
      });
    }
  }

  if (normalized.includes('search') || normalized.includes('list')) {
    return selectImportantLines(output, 20);
  }

  if (normalized.includes('file') || normalized.includes('read') || normalized.includes('content')) {
    return compressFileContent(output);
  }

  return null;
}

function compressFetchLike(output: string): string | null {
  const trimmed = output.trim();
  if (trimmed.startsWith('{') || trimmed.startsWith('[')) {
    const json = tryParseJson(output);
    if (Array.isArray(json)) return sampleJsonArray(json, 2);
    if (json && typeof json === 'object') {
      const serialized = compactJson(json);
      if (serialized.length > 3000) {
        return selectImportantLines(output, 25);
      }
    }
  }

  if (trimmed.length > 5000 || output.split('\n').length > 60) {
    return selectImportantLines(output, 30);
  }

  return null;
}

function pseudoCommand(toolName: string): string {
  const n = toolName.toLowerCase();
  if (n.includes('read') || n.includes('file')) return 'cat';
  if (n.includes('grep') || n.includes('search') || n.includes('glob')) return 'rg';
  if (n.includes('github')) return 'mcp github';
  if (n.includes('fetch') || n.includes('browser') || n.includes('web')) return 'mcp fetch';
  return 'mcp tool';
}

export function compressToolOutput(toolName: string, output: string): ToolCompressResult {
  const safe = redactSecrets(output);
  const tokensRaw = estimateTokens(safe);

  if (!safe.trim() || !shouldCompress(toolName, safe)) {
    return {
      output: safe,
      tokensRaw,
      tokensOptimized: tokensRaw,
      compressed: false,
      compressor: 'none',
    };
  }

  const normalized = toolName.toLowerCase();
  let compressed = safe;
  let compressor = 'none';

  if (normalized.includes('read') || normalized.includes('file')) {
    compressed = compressFileContent(safe);
    compressor = 'tool-read';
  } else if (normalized.includes('github')) {
    const result = compressGitHubLike(toolName, safe);
    if (result) {
      compressed = result;
      compressor = 'mcp-github';
    }
  } else if (
    normalized.includes('fetch') ||
    normalized.includes('browser') ||
    normalized.includes('web') ||
    normalized.includes('mcp')
  ) {
    const result = compressFetchLike(safe);
    if (result) {
      compressed = result;
      compressor = 'mcp-fetch';
    }
  }

  if (compressor === 'none') {
    const { result, compressor: smartCompressor } = smartCompress(pseudoCommand(toolName), safe);
    if (result !== safe) {
      compressed = result;
      compressor = `tool-${smartCompressor}`;
    }
  }

  const { tokens: sizeTokens } = estimateOutputSize(safe);
  if (compressor !== 'none' && sizeTokens > 1500 && estimateTokens(compressed) > sizeTokens * 0.65) {
    const retry = smartCompress(pseudoCommand(toolName), safe);
    if (estimateTokens(retry.result) < estimateTokens(compressed)) {
      compressed = retry.result;
      compressor = `${compressor}+escalated`;
    }
  }

  const tokensOptimized = estimateTokens(compressed);
  const didCompress = compressed !== safe && tokensOptimized < tokensRaw;

  return {
    output: didCompress ? compressed : safe,
    tokensRaw,
    tokensOptimized: didCompress ? tokensOptimized : tokensRaw,
    compressed: didCompress,
    compressor: didCompress ? compressor : 'none',
  };
}
