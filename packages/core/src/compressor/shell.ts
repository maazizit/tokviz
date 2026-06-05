import { estimateTokens } from '../tokens.js';

export interface CompressResult {
  output: string;
  tokensRaw: number;
  tokensOptimized: number;
  compressed: boolean;
}

const MAX_LINES = 80;
const MAX_DIFF_LINES = 120;

function truncateLines(text: string, max: number): string {
  const lines = text.split('\n');
  if (lines.length <= max) return text;
  const kept = lines.slice(0, max);
  kept.push(`\n[tokviz] … ${lines.length - max} lines truncated`);
  return kept.join('\n');
}

function compressGitStatus(output: string): string {
  const lines = output.split('\n');
  const important = lines.filter(
    (l) =>
      l.startsWith('On branch') ||
      l.startsWith('Changes') ||
      l.startsWith('modified:') ||
      l.startsWith('new file:') ||
      l.startsWith('deleted:') ||
      l.startsWith('Untracked') ||
      l.trim() === ''
  );
  const untrackedIdx = important.findIndex((l) => l.startsWith('Untracked'));
  if (untrackedIdx >= 0) {
    const before = important.slice(0, untrackedIdx + 1);
    const untracked = important.slice(untrackedIdx + 1).filter((l) => l.trim());
    if (untracked.length > 10) {
      before.push(`  … ${untracked.length} untracked files (tokviz summary)`);
      return before.join('\n');
    }
  }
  return important.join('\n') || output;
}

function compressGitDiff(output: string): string {
  return truncateLines(output, MAX_DIFF_LINES);
}

function compressGitLog(output: string): string {
  return truncateLines(output, 30);
}

function compressTestOutput(output: string): string {
  const lines = output.split('\n');
  const errors = lines.filter(
    (l) =>
      /FAIL|ERROR|error:|failed|AssertionError/i.test(l) ||
      l.trim().startsWith('E ') ||
      l.includes('✗') ||
      l.includes('✘')
  );
  const summary = lines.filter((l) => /passed|failed|tests?/i.test(l)).slice(-5);
  if (errors.length === 0 && summary.length > 0) {
    return `[tokviz] test summary\n${summary.join('\n')}`;
  }
  if (errors.length > 0) {
    const body = truncateLines(errors.join('\n'), 40);
    return `[tokviz] errors only\n${body}`;
  }
  return truncateLines(output, MAX_LINES);
}

export function compressShellOutput(command: string, output: string): CompressResult {
  const tokensRaw = estimateTokens(output);
  if (!output.trim()) {
    return { output, tokensRaw, tokensOptimized: tokensRaw, compressed: false };
  }

  const cmd = command.trim().toLowerCase();
  let compressed = output;

  if (/\bgit\s+status\b/.test(cmd)) {
    compressed = compressGitStatus(output);
  } else if (/\bgit\s+diff\b/.test(cmd)) {
    compressed = compressGitDiff(output);
  } else if (/\bgit\s+log\b/.test(cmd)) {
    compressed = compressGitLog(output);
  } else if (/\b(pytest|cargo test|npm test|pnpm test|jest|vitest)\b/.test(cmd)) {
    compressed = compressTestOutput(output);
  } else if (/\b(grep|rg|find|ls|docker ps|kubectl get)\b/.test(cmd)) {
    compressed = truncateLines(output, MAX_LINES);
  }

  const tokensOptimized = estimateTokens(compressed);
  const didCompress = compressed !== output && tokensOptimized < tokensRaw;

  return {
    output: didCompress ? compressed : output,
    tokensRaw,
    tokensOptimized: didCompress ? tokensOptimized : tokensRaw,
    compressed: didCompress,
  };
}
