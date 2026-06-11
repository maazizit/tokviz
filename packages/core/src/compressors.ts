import { dedupeLines, removeNoise, truncateLines } from './noise.js';
import { collapseDiffBlock } from './security.js';

const MAX_GENERIC_LINES = 80;
const MAX_LIST_LINES = 40;
const MAX_DIFF_LINES = 120;

const COMPRESSOR_ORDER = [
  'docker logs',
  'docker ps',
  'kubectl',
  'aws',
  'gcp',
  'curl',
  'cat',
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

function tryParseJson(output: string): unknown | null {
  const trimmed = output.trim();
  if (!trimmed.startsWith('{') && !trimmed.startsWith('[')) return null;
  try {
    return JSON.parse(trimmed) as unknown;
  } catch {
    return null;
  }
}

function compressJsonOutput(data: unknown, maxItems = 2): string {
  if (Array.isArray(data)) {
    if (data.length <= maxItems) return JSON.stringify(data);
    return JSON.stringify({
      _tokviz: `${data.length} items`,
      sample: data.slice(0, maxItems),
      _omitted: data.length - maxItems,
    });
  }

  if (data && typeof data === 'object') {
    const entries = Object.entries(data as Record<string, unknown>);
    if (entries.length > 10) {
      const trimmed = Object.fromEntries(entries.slice(0, 6));
      return JSON.stringify({
        _tokviz: `${entries.length} keys`,
        ...trimmed,
        _omittedKeys: entries.length - 6,
      });
    }
  }

  return JSON.stringify(data);
}

function compressTableOutput(output: string, maxRows = 8): string {
  const lines = output.split('\n').filter((l) => l.trim());
  if (lines.length <= maxRows + 1) return output;

  const header = lines[0];
  const rows = lines.slice(1);
  return [
    header,
    ...rows.slice(0, maxRows),
    `… ${rows.length - maxRows} more rows (tokviz summary)`,
  ].join('\n');
}

function compressGrepLike(output: string, maxLines = 25, sampleMatches = 2): string {
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
    if (matches.length > sampleMatches) {
      result.push(`${file}: (${matches.length} matches)`);
      result.push(...matches.slice(0, sampleMatches));
    } else {
      result.push(...matches);
    }
  }
  return truncateLines(result.join('\n'), maxLines);
}

function compressGrep(output: string): string {
  return compressGrepLike(output, 15, 1);
}

function isCargoFailureLine(line: string): boolean {
  const t = line.trim();
  return (
    /^test\s+.+\s+\.\.\.\s+FAILED/i.test(t) ||
    /^failures:/i.test(t) ||
    /thread '.*' panicked/i.test(t) ||
    /AssertionError/i.test(t) ||
    /^error\[/i.test(t) ||
    /^error:/i.test(t) ||
    t.startsWith('E ')
  );
}

function extractCargoTestCount(lines: string[]): string {
  const explicit = lines.find((l) => /^test result:/i.test(l.trim()));
  if (explicit) return explicit.trim();

  const ok = lines.filter((l) => /\.\.\.\s+ok$/i.test(l.trim())).length;
  const failed = lines.filter((l) => /\.\.\.\s+FAILED/i.test(l.trim())).length;
  if (ok + failed > 0) return `test result: ${ok} passed; ${failed} failed`;
  return 'test result: ok. 0 passed; 0 failed';
}

/** cargo / pytest — failures + count only */
function compressCargoTestOutput(output: string): string {
  const lines = output.split('\n');
  const failures: string[] = [];
  let capturing = false;

  for (const line of lines) {
    if (isCargoFailureLine(line)) {
      capturing = true;
      failures.push(line);
      continue;
    }
    if (capturing) {
      const t = line.trim();
      if (/^test\s+\S+/.test(t) || /^running \d+ test/i.test(t) || /^test result:/i.test(t)) {
        capturing = false;
      } else if (t) {
        failures.push(line);
      }
    }
  }

  const count = extractCargoTestCount(lines);
  if (failures.length === 0) return count;
  return [...failures, count].join('\n');
}

/** npm / jest / vitest — failures only */
function compressNpmTestOutput(output: string): string {
  const lines = output.split('\n');
  const failures: string[] = [];
  let inFailure = false;

  for (const line of lines) {
    if (/^FAIL\s/i.test(line)) {
      inFailure = true;
      failures.push(line);
      continue;
    }
    if (/^PASS\s/i.test(line)) {
      inFailure = false;
      continue;
    }
    if (/^\s*●\s/.test(line)) {
      inFailure = true;
      failures.push(line);
      continue;
    }
    if (inFailure) {
      if (/^Test Suites:|^Tests:|^Snapshots:/i.test(line.trim())) {
        inFailure = false;
        continue;
      }
      failures.push(line);
    }
  }

  const filtered = failures.filter(
    (l) => !/^Test Suites:|^Tests:|^Snapshots:/i.test(l.trim())
  );

  if (filtered.length === 0) return 'tokviz: all tests passed';
  return filtered.join('\n');
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
      result.push(...collapseDiffBlock(block, 1, 'additions'));
      continue;
    }
    if (trimmed.startsWith('-')) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('-')) {
        block.push(lines[i].trimStart());
        i++;
      }
      result.push(...collapseDiffBlock(block, 1, 'deletions'));
      continue;
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

    if (trimmed.startsWith('@@')) {
      result.push(trimmed);
      i++;
      continue;
    }

    if (
      trimmed.startsWith('diff --git') ||
      trimmed.startsWith('index ') ||
      trimmed.startsWith('--- ') ||
      trimmed.startsWith('+++ ')
    ) {
      i++;
      continue;
    }

    if (trimmed.startsWith('+')) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('+')) {
        block.push(lines[i].trimStart());
        i++;
      }
      result.push(...collapseDiffBlock(block, 1, 'additions'));
      continue;
    }

    if (trimmed.startsWith('-')) {
      const block: string[] = [];
      while (i < lines.length && lines[i].trimStart().startsWith('-')) {
        block.push(lines[i].trimStart());
        i++;
      }
      result.push(...collapseDiffBlock(block, 1, 'deletions'));
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

function compressKubectlDescribe(output: string): string {
  const lines = output.split('\n');
  const keep = new Set<string>();
  const keys = [
    /^Name:/,
    /^Namespace:/,
    /^Labels:/,
    /^Status:/,
    /^Phase:/,
    /^Reason:/,
    /^Message:/,
    /^Events:/,
    /^Conditions:/,
    /^Containers:/,
    /^Image:/,
    /^Ready:/,
    /^Restarts:/,
  ];

  for (const line of lines) {
    const t = line.trim();
    if (keys.some((re) => re.test(t))) keep.add(line);
    if (/Error|Warning|Failed|CrashLoop/i.test(t)) keep.add(line);
  }

  if (keep.size === 0) return compressTableOutput(output, 10);
  return truncateLines([...keep].join('\n'), 35);
}

function compressKubectl(output: string): string {
  const json = tryParseJson(output);
  if (json) return compressJsonOutput(json, 3);

  if (output.includes('Name:') && output.includes('Namespace:')) {
    return compressKubectlDescribe(output);
  }

  return compressTableOutput(output, 6);
}

function compressAws(output: string): string {
  const json = tryParseJson(output);
  if (json) return compressJsonOutput(json, 2);

  const lines = output.split('\n').filter((l) => l.trim());
  if (lines.length > 12) {
    return [...lines.slice(0, 8), `… ${lines.length - 8} more (tokviz summary)`].join('\n');
  }

  return compressTableOutput(output, 8);
}

function compressGcp(output: string): string {
  const json = tryParseJson(output);
  if (json) return compressJsonOutput(json, 2);

  return compressTableOutput(output, 10);
}

function compressDockerPs(output: string): string {
  const lines = output.split('\n').filter((l) => l.trim());
  if (lines.length <= 10) return output;

  const headerIdx = lines.findIndex((l) => /CONTAINER ID|NAMES/i.test(l));
  const header = headerIdx >= 0 ? lines[headerIdx] : lines[0];
  const dataRows = lines.filter((l, i) => i !== headerIdx && l !== header);

  if (dataRows.length <= 8) return output;

  return [
    header,
    ...dataRows.slice(0, 8),
    `… ${dataRows.length - 8} more containers (tokviz summary)`,
  ].join('\n');
}

function stripDockerLogNoise(line: string): string {
  return line
    .replace(/\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d+Z /g, '')
    .replace(/^[a-f0-9]{12} /, '')
    .replace(/^\[?(DEBUG|INFO)\]? ?/i, '')
    .replace(/\d+ms\b/g, 'Nms')
    .trim();
}

/** ERROR/WARN only — drop DEBUG/INFO */
function compressDockerLogs(output: string): string {
  const lines = output.split('\n').filter((l) => l.trim());
  const kept = lines
    .filter((l) => /\b(ERROR|WARN|WARNING|FATAL)\b|Exception|Traceback/i.test(l))
    .map(stripDockerLogNoise)
    .filter((l) => l.length > 0);

  if (kept.length === 0) {
    return `tokviz: no ERROR/WARN in logs (${lines.length} lines omitted)`;
  }

  return truncateLines(kept.join('\n'), 30);
}

function formatCurlChunk(headers: string[], body: string[]): string {
  const status = headers[0] ?? '';
  const keptHeaders = headers.filter((h, i) => {
    if (i === 0) return true;
    return /^(content-type|content-length|location|set-cookie|x-|server|date):/i.test(h);
  }).slice(0, 5);

  const bodyText = body.join('\n').trim();
  if (!bodyText) return keptHeaders.join('\n');

  if (bodyText.length > 400) {
    return [
      ...keptHeaders,
      '',
      bodyText.slice(0, 300),
      `… ${bodyText.length - 300} body chars omitted`,
    ].join('\n');
  }

  return [...keptHeaders, '', truncateLines(bodyText, 15)].join('\n');
}

function compressCurl(output: string): string {
  const lines = output.split('\n');
  const chunks: string[] = [];
  let headerLines: string[] = [];
  let bodyLines: string[] = [];
  let inHeaders = false;
  let sawResponse = false;

  const flush = () => {
    if (headerLines.length || bodyLines.length) {
      chunks.push(formatCurlChunk(headerLines, bodyLines));
    }
    headerLines = [];
    bodyLines = [];
    inHeaders = false;
  };

  for (const line of lines) {
    if (/^HTTP\/[\d.]+\s+\d+/.test(line) || /^< HTTP\/[\d.]+\s+\d+/.test(line)) {
      flush();
      headerLines.push(line.replace(/^<\s*/, ''));
      inHeaders = true;
      sawResponse = true;
      continue;
    }

    if (/^<\s*[\w-]+:/.test(line)) {
      headerLines.push(line.replace(/^<\s*/, ''));
      continue;
    }

    if (inHeaders && line.trim() === '') {
      inHeaders = false;
      continue;
    }

    if (inHeaders) headerLines.push(line);
    else if (!/^\s*%\s+Total|% Received|Dload\s+Upload|Speed|^\*/.test(line)) {
      bodyLines.push(line);
    }
  }

  flush();

  if (sawResponse) return chunks.join('\n---\n');
  return truncateLines(
    lines.filter((l) => !/^\s*%\s+Total|% Received|Dload\s+Upload|^\*/.test(l)).join('\n'),
    30
  );
}

function compressCat(output: string): string {
  const lines = output.split('\n');
  if (lines.length <= 40) return output;

  const head = lines.slice(0, 15);
  const tail = lines.slice(-5);
  return [
    ...head,
    `… ${lines.length - 20} lines omitted (tokviz summary)`,
    ...tail,
  ].join('\n');
}

export const compressors: Record<CompressorKey, (output: string) => string> = {
  kubectl: compressKubectl,
  aws: compressAws,
  gcp: compressGcp,
  curl: compressCurl,
  cat: compressCat,

  'git diff': compressGitDiff,

  'cargo test': compressCargoTestOutput,
  pytest: compressCargoTestOutput,
  'npm test': compressNpmTestOutput,
  'pnpm test': compressNpmTestOutput,
  vitest: compressNpmTestOutput,
  jest: compressNpmTestOutput,

  'docker logs': compressDockerLogs,
  'docker ps': compressDockerPs,

  grep: compressGrep,
  rg: (output: string) => compressGrepLike(output, 25, 2),

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
};

const WORD_BOUNDARY_MATCHERS: Partial<Record<CompressorKey, RegExp>> = {
  cat: /\bcat\b/,
  curl: /\bcurl\b/,
  aws: /\baws\b/,
  kubectl: /\bkubectl\b/,
  gcp: /\b(gcloud|gcp)\b/,
};

export function detectCommandType(cmd: string): CompressorKey | 'generic' {
  const lower = cmd.toLowerCase().trim();

  for (const name of COMPRESSOR_ORDER) {
    const wordRe = WORD_BOUNDARY_MATCHERS[name];
    if (wordRe) {
      if (wordRe.test(lower)) return name;
      continue;
    }
    if (lower.includes(name)) return name;
  }
  return 'generic';
}

export function smartCompress(cmd: string, output: string): string {
  if (!output.trim()) return output;

  const cleaned = removeNoise(output, 'aggressive');
  const type = detectCommandType(cmd);
  let compressed = cleaned;

  if (type !== 'generic') {
    compressed = compressors[type](compressed);
  } else {
    compressed = truncateLines(compressed, MAX_GENERIC_LINES);
  }

  compressed = dedupeLines(compressed, 2);

  if (!compressed.trim()) return output;

  return compressed;
}
