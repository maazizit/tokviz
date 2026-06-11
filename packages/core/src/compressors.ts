import { dedupeLines, removeNoise, truncateLines } from './noise.js';

const MAX_GENERIC_LINES = 80;
const MAX_LIST_LINES = 40;
const MAX_DIFF_LINES = 120;

const COMPRESSOR_ORDER = [
  'docker logs',
  'docker ps',
  'kubectl get',
  'git diff',
  'git status',
  'git log',
  'cargo test',
  'pnpm test',
  'npm test',
  'pytest',
  'vitest',
  'jest',
  'rg',
  'grep',
  'find',
  'ls',
] as const;

type CompressorKey = (typeof COMPRESSOR_ORDER)[number];

function parseGrepLine(line: string): { file: string; body: string } {
  const match = line.match(/^(.+?):(\d+):(.*)$/);
  if (match) return { file: match[1], body: `${match[2]}:${match[3]}` };
  return { file: line, body: '' };
}

function compressGrepLike(output: string): string {
  const lines = output
    .split('\n')
    .filter((l) => l.trim())
    .map((l) => l.replace(/\s+/g, ' ').trim());

  const byFile = new Map<string, string[]>();
  for (const line of lines) {
    const { file } = parseGrepLine(line);
    const group = byFile.get(file) ?? [];
    group.push(line);
    byFile.set(file, group);
  }

  const result: string[] = [];
  for (const [file, matches] of [...byFile.entries()].sort()) {
    if (matches.length > 2) {
      result.push(`${file}: (${matches.length} matches)`);
      result.push(matches[0], matches[1]);
    } else {
      result.push(...matches);
    }
  }
  return truncateLines(result.join('\n'), 25);
}

function compressTestOutput(output: string): string {
  const lines = output.split('\n');
  const failures = lines.filter(
    (l) =>
      /FAILED|FAIL |ERROR|error:|AssertionError|✗|✘/i.test(l) ||
      l.trim().startsWith('E ') ||
      l.includes('●')
  );
  const summary = lines.filter(
    (l) =>
      /test result|failures:|passed|failed|Tests:|Test Suites:|Snapshots:/i.test(l)
  );

  if (failures.length === 0) {
    return summary.slice(-5).join('\n');
  }

  return truncateLines([...failures, ...summary.slice(-3)].join('\n'), 60);
}

function isGitStatusFileLine(line: string): boolean {
  const t = line.trim();
  if (!t || t.startsWith('(use ')) return false;
  if (/^(modified|new file|deleted):/.test(t)) return true;
  if (/^[ MADRCU?!]{2} /.test(line)) return true;
  if (/^\?\? /.test(line)) return true;
  return false;
}

function compressGitStatus(output: string): string {
  const lines = output.split('\n');
  const branch = lines.find(
    (l) => l.startsWith('On branch') || /^\* \S/.test(l.trimStart())
  );
  const files = lines.filter(isGitStatusFileLine);

  const untracked = files.filter((l) => l.startsWith('??'));
  const tracked = files.filter((l) => !l.startsWith('??'));

  const result: string[] = [];
  if (branch) result.push(branch.trim());

  if (tracked.length > 3) {
    result.push(...tracked.slice(0, 2));
    result.push(`… ${tracked.length - 2} more tracked files (tokviz summary)`);
  } else {
    result.push(...tracked);
  }

  if (untracked.length > 3) {
    result.push(`Untracked: … ${untracked.length} files (tokviz summary)`);
  } else {
    result.push(...untracked);
  }

  return result.join('\n') || output;
}

function isCustomGitDiff(output: string): boolean {
  return output.includes('--- Changes ---');
}

function compressCustomGitDiff(output: string): string {
  const lines = output.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();
    if (!line.trim()) {
      i++;
      continue;
    }
    if (/^\d+ files? changed/.test(line.trim())) {
      i++;
      continue;
    }
    if (line.includes('|') && /\|\s*\d+\s*[\-+]+/.test(line)) {
      i++;
      continue;
    }
    if (line.startsWith('--- Changes ---')) {
      result.push(line);
      i++;
      continue;
    }
    if (trimmed.startsWith('@@')) {
      result.push(trimmed);
      i++;
      continue;
    }

    if (trimmed.startsWith('+')) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('+')) {
        block.push(lines[i].trimStart());
        i++;
      }
      if (block.length > 5) {
        result.push(block[0], block[1]);
        result.push(`[tokviz] … ${block.length - 2} additions omitted`);
      } else {
        result.push(...block);
      }
      continue;
    }
    if (trimmed.startsWith('-')) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('-')) {
        block.push(lines[i].trimStart());
        i++;
      }
      if (block.length > 4) {
        result.push(block[0], block[1]);
        result.push(`[tokviz] … ${block.length - 2} deletions omitted`);
      } else {
        result.push(...block);
      }
      continue;
    }
    if (/^\+\d+ -\d+$/.test(trimmed)) {
      result.push(trimmed);
      i++;
      continue;
    }
    if (!line.startsWith(' ') && line.includes('/') && !line.includes('|')) {
      result.push(line.trim());
    }
    i++;
  }

  return truncateLines(result.join('\n'), MAX_DIFF_LINES);
}

function compressUnifiedGitDiff(output: string): string {
  const lines = output.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trimStart();

    if (trimmed.startsWith('diff --git') || trimmed.startsWith('@@')) {
      result.push(trimmed);
      i++;
      continue;
    }

    if (trimmed.startsWith('index ') || trimmed.startsWith('--- ') || trimmed.startsWith('+++ ')) {
      i++;
      continue;
    }

    if (trimmed.startsWith('+')) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('+')) {
        block.push(lines[i].trimStart());
        i++;
      }
      if (block.length > 5) {
        result.push(block[0], block[1]);
        result.push(`[tokviz] … ${block.length - 2} additions omitted`);
      } else {
        result.push(...block);
      }
      continue;
    }

    if (trimmed.startsWith('-')) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('-')) {
        block.push(lines[i].trimStart());
        i++;
      }
      if (block.length > 4) {
        result.push(block[0], block[1]);
        result.push(`[tokviz] … ${block.length - 2} deletions omitted`);
      } else {
        result.push(...block);
      }
      continue;
    }

    i++;
  }

  return truncateLines(result.join('\n'), MAX_DIFF_LINES);
}

function compressGitDiff(output: string): string {
  if (isCustomGitDiff(output)) return compressCustomGitDiff(output);
  return compressUnifiedGitDiff(output);
}

export const compressors: Record<CompressorKey, (output: string) => string> = {
  'git diff': compressGitDiff,

  'cargo test': compressTestOutput,
  'npm test': compressTestOutput,
  'pnpm test': compressTestOutput,
  pytest: compressTestOutput,
  vitest: compressTestOutput,
  jest: compressTestOutput,

  'docker logs': (output: string) => {
    return output
      .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /g, '')
      .replace(/^[a-f0-9]{12} /gm, '')
      .replace(/^\[?(DEBUG|INFO|WARN|WARNING|ERROR)\]? ?/gm, '')
      .replace(/\d+ms\b/g, 'Nms')
      .trim();
  },

  grep: compressGrepLike,
  rg: compressGrepLike,

  'git status': compressGitStatus,

  'git log': (output: string) => {
    const lines = output.split('\n');
    const oneline = lines.every((l) => !l.trim() || /^[a-f0-9]{7,}\s/.test(l.trim()));
    if (oneline) {
      return truncateLines(lines.filter((l) => l.trim()).join('\n'), 20);
    }
    return truncateLines(
      lines
        .filter(
          (l) =>
            l.startsWith('commit ') ||
            l.startsWith('Author:') ||
            (l.trim() !== '' &&
              !l.startsWith('Date:') &&
              !l.startsWith('CommitDate:') &&
              !l.startsWith('Merge:'))
        )
        .join('\n'),
      30
    );
  },

  ls: (output: string) => truncateLines(output, MAX_LIST_LINES),
  find: (output: string) => truncateLines(output, MAX_LIST_LINES),

  'docker ps': (output: string) => truncateLines(output, 25),
  'kubectl get': (output: string) => truncateLines(output, 12),
};

export function detectCommandType(cmd: string): CompressorKey | 'generic' {
  const lower = cmd.toLowerCase();
  for (const name of COMPRESSOR_ORDER) {
    if (lower.includes(name)) return name;
  }
  return 'generic';
}

export function smartCompress(cmd: string, output: string): string {
  if (!output.trim()) return output;

  const type = detectCommandType(cmd);
  let compressed = output;

  if (type !== 'generic') {
    compressed = compressors[type](compressed);
  } else {
    compressed = truncateLines(compressed, MAX_GENERIC_LINES);
  }

  compressed = removeNoise(compressed);
  compressed = dedupeLines(compressed, 3);

  // Fail-safe: never return empty when input had content
  if (!compressed.trim()) return output;

  return compressed;
}
