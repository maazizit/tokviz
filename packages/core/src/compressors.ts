import { dedupeLinesSmart, removeNoise, selectImportantLines, truncateLines } from './noise.js';
import { collapseDiffBlock } from './security.js';
import {
  estimateOutputSize,
  nextCompressionLevel,
  resolveCompressionLevel,
  shouldEscalateCompression,
} from './compressor/adaptive.js';
import { estimateTokens } from './tokens.js';

const MAX_GENERIC_LINES = 80;
const MAX_LIST_LINES = 40;
const MAX_DIFF_LINES = 120;

const COMPRESSOR_ORDER = [
  'docker build',
  'docker logs',
  'docker ps',
  'npm install',
  'pnpm install',
  'yarn install',
  'bun install',
  'pip install',
  'poetry install',
  'terraform plan',
  'terraform apply',
  'npm run build',
  'pnpm run build',
  'make',
  'go test',
  'tsc',
  'webpack',
  'vite build',
  'kubectl',
  'aws',
  'gcp',
  'curl',
  'cat',
  'git diff',
  'git show',
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

type OutputFormat = 'json' | 'xml' | 'yaml' | 'table' | 'logs' | 'code' | 'unknown';

/** Auto-detect output format */
function detectOutputFormat(output: string): OutputFormat {
  const trimmed = output.trim();
  const _firstLine = trimmed.split('\n')[0];

  // JSON
  if ((trimmed.startsWith('{') || trimmed.startsWith('[')) && tryParseJson(output)) {
    return 'json';
  }

  // XML
  if (trimmed.startsWith('<?xml') || /^<[\w-]+[^>]*>/.test(trimmed)) {
    return 'xml';
  }

  // YAML (key: value at start of lines)
  const yamlPattern = /^[\w-]+:\s*[\w-]/m;
  if (yamlPattern.test(trimmed) && !trimmed.includes('{') && !trimmed.includes('<')) {
    const lines = trimmed.split('\n').slice(0, 5);
    const yamlLines = lines.filter((l) => /^[\w-]+:\s/.test(l.trim()));
    if (yamlLines.length >= 2) {
      return 'yaml';
    }
  }

  // Table (headers with dashes or pipes)
  const lines = trimmed.split('\n');
  if (lines.length >= 2) {
    const hasTableSeparator = lines.some((l) => /^[-+|=\s]+$/.test(l.trim()));
    const hasPipes = lines.filter((l) => l.includes('|')).length >= 2;
    if (hasTableSeparator || hasPipes) {
      return 'table';
    }
  }

  // Logs (timestamps, log levels)
  const logPattern =
    /^\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}|^\[?(DEBUG|INFO|WARN|ERROR|FATAL)\]?:/im;
  if (logPattern.test(trimmed)) {
    return 'logs';
  }

  // Code (function, class, import keywords)
  const codePattern = /\b(function|class|import|export|const|let|var|def|async)\s+\w+/;
  if (codePattern.test(trimmed)) {
    return 'code';
  }

  return 'unknown';
}

/** Compress based on detected format */
function compressByFormat(output: string, format: OutputFormat): string {
  switch (format) {
    case 'json': {
      const data = tryParseJson(output);
      return data ? compressJsonOutput(data, 3, 'auto') : output;
    }
    case 'xml':
      return selectImportantLines(output, 30);
    case 'yaml':
      return selectImportantLines(output, 40);
    case 'table':
      return compressTableOutput(output, 12);
    case 'logs':
      return selectImportantLines(output, 50);
    case 'code':
      return truncateLines(output, 60);
    default:
      return truncateLines(output, MAX_GENERIC_LINES);
  }
}

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

function compressJsonOutput(data: unknown, maxItems = 2, context?: string): string {
  if (Array.isArray(data)) {
    // For large arrays, show samples
    if (data.length <= maxItems) return JSON.stringify(data);

    // Keep more items for certain contexts
    const itemsToShow = context === 'logs' ? Math.min(2, maxItems) : maxItems;

    return JSON.stringify({
      _tokviz: `${data.length} items`,
      sample: data.slice(0, itemsToShow),
      _omitted: data.length - itemsToShow,
    });
  }

  if (data && typeof data === 'object') {
    const obj = data as Record<string, unknown>;
    const entries = Object.entries(obj);

    // Identify critical keys to always keep
    const criticalKeys = new Set([
      'name',
      'version',
      'error',
      'message',
      'status',
      'code',
      'dependencies',
      'devDependencies',
      'scripts',
      'main',
      'type',
    ]);

    const critical = entries.filter(([key]) => criticalKeys.has(key));
    const others = entries.filter(([key]) => !criticalKeys.has(key));

    // Keep all critical keys
    const result: Record<string, unknown> = {};
    for (const [key, value] of critical) {
      // Compress nested objects/arrays in critical keys too
      if (Array.isArray(value) && value.length > 10) {
        result[key] = `[${value.length} items]`;
      } else if (value && typeof value === 'object') {
        result[key] = compressJsonOutput(value, 2, key);
      } else {
        result[key] = value;
      }
    }

    // Add some non-critical keys
    const maxOthers = Math.max(0, 6 - critical.length);
    for (let i = 0; i < Math.min(maxOthers, others.length); i++) {
      const [key, value] = others[i];
      if (Array.isArray(value) && value.length > 5) {
        result[key] = `[${value.length} items]`;
      } else if (value && typeof value === 'object') {
        result[key] = '[nested object]';
      } else {
        result[key] = value;
      }
    }

    if (others.length > maxOthers) {
      result._omittedKeys = others.length - maxOthers;
    }

    return JSON.stringify(result);
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

  const filtered = failures.filter((l) => !/^Test Suites:|^Tests:|^Snapshots:/i.test(l.trim()));

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
  const branch = lines.find((l) => l.startsWith('On branch') || /^\* \S/.test(l.trimStart()));
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
  if (json) return compressJsonOutput(json, 3, 'kubectl');

  if (output.includes('Name:') && output.includes('Namespace:')) {
    return compressKubectlDescribe(output);
  }

  return compressTableOutput(output, 6);
}

function compressAws(output: string): string {
  const json = tryParseJson(output);
  if (json) return compressJsonOutput(json, 2, 'aws');

  const lines = output.split('\n').filter((l) => l.trim());
  if (lines.length > 12) {
    return [...lines.slice(0, 8), `… ${lines.length - 8} more (tokviz summary)`].join('\n');
  }

  return compressTableOutput(output, 8);
}

function compressGcp(output: string): string {
  const json = tryParseJson(output);
  if (json) return compressJsonOutput(json, 2, 'gcp');

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
  const _status = headers[0] ?? '';
  const keptHeaders = headers
    .filter((h, i) => {
      if (i === 0) return true;
      return /^(content-type|content-length|location|set-cookie|x-|server|date):/i.test(h);
    })
    .slice(0, 5);

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

  const flush = (): void => {
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
  return [...head, `… ${lines.length - 20} lines omitted (tokviz summary)`, ...tail].join('\n');
}

/** npm/pnpm/yarn/bun install — keep errors, warnings, and summary */
function compressPackageInstall(output: string): string {
  const lines = output.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    const _lower = line.toLowerCase();
    // Keep errors, warnings, and important info
    if (
      /\b(error|err|warn|warning|deprecated|failed|fatal)\b/i.test(line) ||
      /\b(installed|added|removed|updated)\b/i.test(line) ||
      /^\s*[\+\-]\s/.test(line) ||
      /^(Done|Success|✓)/i.test(line.trim()) ||
      /\d+\s+packages?\s+in\s+[\d.]+s/i.test(line)
    ) {
      kept.push(line);
    }
  }

  if (kept.length === 0) {
    return `tokviz: install completed (${lines.length} log lines omitted)`;
  }

  return truncateLines(kept.join('\n'), 40);
}

/** pip/poetry install — keep errors and summary */
function compressPythonInstall(output: string): string {
  const lines = output.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    if (
      /\b(error|err|warn|warning|failed|fatal|exception)\b/i.test(line) ||
      /Successfully installed/i.test(line) ||
      /^Installing /i.test(line.trim()) ||
      /\d+ packages? (installed|updated)/i.test(line)
    ) {
      kept.push(line);
    }
  }

  if (kept.length === 0) {
    return `tokviz: Python packages installed (${lines.length} log lines omitted)`;
  }

  return truncateLines(kept.join('\n'), 30);
}

/** docker build — keep stages, errors, and final image ID */
function compressDockerBuild(output: string): string {
  const lines = output.split('\n');
  const kept: string[] = [];
  let lastImageId: string | null = null;

  for (const line of lines) {
    if (
      /^Step \d+\/\d+/i.test(line) ||
      /^#\d+\s+\[/i.test(line) ||
      /\b(error|err|warn|warning|failed|fatal)\b/i.test(line) ||
      /^CACHED/i.test(line.trim()) ||
      /^Building/i.test(line.trim())
    ) {
      kept.push(line);
    }

    // Capture final image ID
    const imageIdMatch = line.match(/Successfully built ([a-f0-9]{12})/i);
    if (imageIdMatch) {
      lastImageId = imageIdMatch[1];
      kept.push(line);
    }

    if (/Successfully tagged/i.test(line)) {
      kept.push(line);
    }
  }

  if (kept.length === 0 && lastImageId) {
    return `tokviz: docker build completed → ${lastImageId}`;
  }

  if (kept.length === 0) {
    return `tokviz: docker build completed (${lines.length} log lines omitted)`;
  }

  return truncateLines(kept.join('\n'), 50);
}

/** terraform plan/apply — keep changes and summary */
function compressTerraform(output: string): string {
  const lines = output.split('\n');
  const kept: string[] = [];
  let inChanges = false;

  for (const line of lines) {
    const trimmed = line.trim();

    // Keep summary lines
    if (
      /^Plan:/i.test(trimmed) ||
      /^Apply complete!/i.test(trimmed) ||
      /^\d+ to add, \d+ to change, \d+ to destroy/i.test(trimmed) ||
      /^Error:/i.test(trimmed) ||
      /^Warning:/i.test(trimmed)
    ) {
      kept.push(line);
      continue;
    }

    // Track resource changes
    if (/^(# |~|\+|-)\s*\w+\.\w+/.test(trimmed)) {
      inChanges = true;
      kept.push(line);
      continue;
    }

    // Keep first few lines of each resource change
    if (inChanges && /^\s*[\+\-~]/.test(line)) {
      if (kept.length < 80) {
        kept.push(line);
      }
    } else {
      inChanges = false;
    }
  }

  if (kept.length === 0) {
    return `tokviz: terraform completed (${lines.length} log lines omitted)`;
  }

  return truncateLines(kept.join('\n'), 60);
}

function compressMakeOutput(output: string): string {
  const lines = output.split('\n');
  const kept = lines.filter(
    (line) =>
      /\b(error|failed|warning|make: \*\*\*|No rule to make)\b/i.test(line) ||
      /^make\[/.test(line.trim()) ||
      /^(Nothing to be done|Success|Built target)/i.test(line.trim())
  );
  if (kept.length === 0) {
    return selectImportantLines(output, 25);
  }
  return truncateLines(kept.join('\n'), 35);
}

function compressGoTestOutput(output: string): string {
  return compressCargoTestOutput(output);
}

function compressGitShow(output: string): string {
  const lines = output.split('\n');
  const header = lines.filter(
    (l) =>
      l.startsWith('commit ') ||
      l.startsWith('Author:') ||
      l.startsWith('Date:') ||
      (l.trim() && !l.startsWith('diff --git') && !l.startsWith('index '))
  );
  const diffStart = lines.findIndex((l) => l.startsWith('diff --git') || l.startsWith('@@'));
  if (diffStart >= 0) {
    return compressUnifiedGitDiff(lines.slice(diffStart).join('\n'));
  }
  return truncateLines(header.join('\n'), 30);
}

function compressNpmRunBuild(output: string): string {
  return compressBuildOutput(output);
}

/** tsc/webpack/vite build — keep errors and summary */
function compressBuildOutput(output: string): string {
  const lines = output.split('\n');
  const kept: string[] = [];

  for (const line of lines) {
    if (
      /\b(error|err|warning|warn|failed|fatal)\b/i.test(line) ||
      /^✓|^✔|^Build success|^Built in|^Compiled/i.test(line.trim()) ||
      /\d+\.\d+\s*(k?B|MB)\s+│/i.test(line) ||
      /\d+\s+modules?\s+transformed/i.test(line) ||
      /Hash:|Time:|Chunk Names:/i.test(line)
    ) {
      kept.push(line);
    }
  }

  if (kept.length === 0) {
    return `tokviz: build completed (${lines.length} log lines omitted)`;
  }

  return truncateLines(kept.join('\n'), 40);
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
  'docker build': compressDockerBuild,

  'npm install': compressPackageInstall,
  'pnpm install': compressPackageInstall,
  'yarn install': compressPackageInstall,
  'bun install': compressPackageInstall,

  'pip install': compressPythonInstall,
  'poetry install': compressPythonInstall,

  'terraform plan': compressTerraform,
  'terraform apply': compressTerraform,

  tsc: compressBuildOutput,
  webpack: compressBuildOutput,
  'vite build': compressBuildOutput,

  make: compressMakeOutput,
  'go test': compressGoTestOutput,
  'git show': compressGitShow,
  'npm run build': compressNpmRunBuild,
  'pnpm run build': compressNpmRunBuild,

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
  tsc: /\btsc\b/,
  webpack: /\bwebpack\b/,
  make: /\bmake\b/,
  'go test': /\bgo test\b/,
  'git show': /\bgit show\b/,
  'npm run build': /\bnpm run build\b/,
  'pnpm run build': /\bpnpm run build\b/,
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

export type CompressionLevel = 'light' | 'normal' | 'aggressive' | 'emergency';

/** Hierarchical compression - apply stronger compression at higher levels */
export function compressHierarchical(
  cmd: string,
  output: string,
  level: CompressionLevel = 'normal'
): { result: string; compressor: string } {
  if (!output.trim()) return { result: output, compressor: 'none' };

  const type = detectCommandType(cmd);
  const format = detectOutputFormat(output);
  let compressed = output;
  let compressorUsed = 'generic';

  // Level 1: Light - just noise removal
  if (level === 'light') {
    compressed = removeNoise(output, 'lite');
    return { result: compressed, compressor: 'light' };
  }

  // Level 2: Normal - standard compression pipeline
  if (level === 'normal') {
    const cleaned = removeNoise(output, 'aggressive');

    if (type !== 'generic') {
      compressed = compressors[type](cleaned);
      compressorUsed = type;
    } else if (format !== 'unknown') {
      compressed = compressByFormat(cleaned, format);
      compressorUsed = `auto:${format}`;
    } else {
      compressed = truncateLines(cleaned, MAX_GENERIC_LINES);
      compressorUsed = 'generic';
    }

    compressed = dedupeLinesSmart(compressed, 2);

    // Fail-safe: return original if compression resulted in empty output
    if (!compressed.trim()) {
      return { result: output, compressor: 'failsafe' };
    }

    return { result: compressed, compressor: compressorUsed };
  }

  // Level 3: Aggressive - prioritize important lines
  if (level === 'aggressive') {
    const cleaned = removeNoise(output, 'aggressive');

    if (type !== 'generic') {
      compressed = compressors[type](cleaned);
      compressorUsed = type;
    } else if (format !== 'unknown') {
      compressed = compressByFormat(cleaned, format);
      compressorUsed = `auto:${format}`;
    } else {
      compressed = selectImportantLines(cleaned, 50);
      compressorUsed = 'generic:scored';
    }

    compressed = dedupeLinesSmart(compressed, 2);
    return { result: compressed, compressor: `${compressorUsed}:aggressive` };
  }

  // Level 4: Emergency - only errors, warnings, and critical info
  if (level === 'emergency') {
    const lines = output.split('\n');
    const critical = lines.filter((line) => {
      const _lower = line.toLowerCase();
      return (
        /\b(error|fatal|critical|fail|failed|exception|panic|warn|warning)\b/i.test(line) ||
        /\b(summary|result|total|completed|success)\b/i.test(line)
      );
    });

    if (critical.length === 0) {
      return {
        result: '[tokviz:emergency] No errors or warnings. Command completed.',
        compressor: 'emergency:summary',
      };
    }

    compressed = selectImportantLines(critical.join('\n'), 20);
    return { result: compressed, compressor: 'emergency' };
  }

  return { result: output, compressor: 'none' };
}

export function smartCompress(cmd: string, output: string): { result: string; compressor: string } {
  const { tokens, lines } = estimateOutputSize(output);
  let level = resolveCompressionLevel(tokens, lines);
  let result = compressHierarchical(cmd, output, level);

  if (shouldEscalateCompression(tokens, estimateTokens(result.result), level)) {
    level = nextCompressionLevel(level);
    const escalated = compressHierarchical(cmd, output, level);
    if (estimateTokens(escalated.result) < estimateTokens(result.result)) {
      result = escalated;
    }
  }

  return result;
}
