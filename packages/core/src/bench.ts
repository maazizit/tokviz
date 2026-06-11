import { readFileSync, existsSync, readdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { execSync } from 'node:child_process';
import { smartCompress } from './compressors.js';
import { estimateTokens } from './tokens.js';

export interface BenchFixture {
  name: string;
  command: string;
  output: string;
}

export interface BenchRow {
  name: string;
  command: string;
  charsRaw: number;
  charsOut: number;
  tokensRaw: number;
  tokensOut: number;
  savingsPercent: number;
  pass: boolean;
}

export interface BenchReport {
  rows: BenchRow[];
  totalTokensRaw: number;
  totalTokensOut: number;
  totalSavingsPercent: number;
  targetPercent: number;
  pass: boolean;
}

const DEFAULT_TARGET = 60;

interface ManifestEntry {
  name: string;
  command: string;
  file: string;
}

function defaultFixturesDir(): string {
  const here = dirname(fileURLToPath(import.meta.url));
  return join(here, '..', 'fixtures', 'shell');
}

export function loadFixtures(fixturesDir = defaultFixturesDir()): BenchFixture[] {
  const manifestPath = join(fixturesDir, 'manifest.json');
  if (!existsSync(manifestPath)) {
    throw new Error(`Missing benchmark manifest: ${manifestPath}`);
  }

  const manifest = JSON.parse(readFileSync(manifestPath, 'utf8')) as ManifestEntry[];
  return manifest.map((entry) => ({
    name: entry.name,
    command: entry.command,
    output: readFileSync(join(fixturesDir, entry.file), 'utf8'),
  }));
}

export function benchFixture(
  fixture: BenchFixture,
  targetPercent = DEFAULT_TARGET
): BenchRow {
  const compressed = smartCompress(fixture.command, fixture.output);
  const tokensRaw = estimateTokens(fixture.output);
  const tokensOut = estimateTokens(compressed);
  const savingsPercent =
    tokensRaw > 0 ? Math.round(((tokensRaw - tokensOut) / tokensRaw) * 100) : 0;

  return {
    name: fixture.name,
    command: fixture.command,
    charsRaw: fixture.output.length,
    charsOut: compressed.length,
    tokensRaw,
    tokensOut,
    savingsPercent,
    pass: savingsPercent >= targetPercent || tokensRaw < 50,
  };
}

export function runBenchmark(
  fixtures: BenchFixture[],
  targetPercent = DEFAULT_TARGET
): BenchReport {
  const rows = fixtures.map((f) => benchFixture(f, targetPercent));
  const totalTokensRaw = rows.reduce((sum, r) => sum + r.tokensRaw, 0);
  const totalTokensOut = rows.reduce((sum, r) => sum + r.tokensOut, 0);
  const totalSavingsPercent =
    totalTokensRaw > 0
      ? Math.round(((totalTokensRaw - totalTokensOut) / totalTokensRaw) * 100)
      : 0;

  const meaningful = rows.filter((r) => r.tokensRaw >= 50);
  const pass =
    totalSavingsPercent >= targetPercent &&
    meaningful.every((r) => r.pass || r.savingsPercent >= targetPercent * 0.5);

  return {
    rows,
    totalTokensRaw,
    totalTokensOut,
    totalSavingsPercent,
    targetPercent,
    pass,
  };
}

export interface LiveCapture {
  name: string;
  command: string;
  output: string;
}

export function captureLiveFixtures(repoPath: string): LiveCapture[] {
  const captures: { name: string; command: string; shell: string; cwd?: string }[] = [
    { name: 'live-git-status', command: 'git status', shell: 'git status' },
    { name: 'live-git-log', command: 'git log', shell: 'git log --oneline -20' },
    { name: 'live-git-diff', command: 'git diff', shell: 'git diff' },
    {
      name: 'live-npm-test',
      command: 'npm test',
      shell: 'npm test 2>&1',
      cwd: join(repoPath, 'packages', 'core'),
    },
  ];

  const results: LiveCapture[] = [];
  for (const cap of captures) {
    try {
      const output = execSync(cap.shell, {
        cwd: cap.cwd ?? repoPath,
        encoding: 'utf8',
        maxBuffer: 10 * 1024 * 1024,
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      if (output.trim()) {
        results.push({ name: cap.name, command: cap.command, output });
      }
    } catch (err) {
      const e = err as { stdout?: string; stderr?: string };
      const output = `${e.stdout ?? ''}${e.stderr ?? ''}`.trim();
      if (output) {
        results.push({ name: cap.name, command: cap.command, output });
      }
    }
  }

  return results;
}

export function formatBenchReport(report: BenchReport): string {
  const lines: string[] = [
    'TokViz — Compression Benchmark',
    '─'.repeat(72),
    `${'Fixture'.padEnd(22)} ${'Cmd'.padEnd(14)} ${'Raw'.padStart(6)} ${'Out'.padStart(6)} ${'Save%'.padStart(6)}`,
    '─'.repeat(72),
  ];

  for (const row of report.rows) {
    const mark = row.pass ? '✓' : '✗';
    lines.push(
      `${mark} ${row.name.padEnd(20)} ${row.command.slice(0, 12).padEnd(14)} ${String(row.tokensRaw).padStart(6)} ${String(row.tokensOut).padStart(6)} ${String(row.savingsPercent).padStart(5)}%`
    );
  }

  lines.push('─'.repeat(72));
  lines.push(
    `TOTAL${' '.repeat(37)} ${String(report.totalTokensRaw).padStart(6)} ${String(report.totalTokensOut).padStart(6)} ${String(report.totalSavingsPercent).padStart(5)}%`
  );
  lines.push('');
  const globalOk = report.totalSavingsPercent >= report.targetPercent;
  lines.push(
    report.pass
      ? `PASS — global ${report.totalSavingsPercent}% (target ${report.targetPercent}%)`
      : globalOk
        ? `FAIL — global ${report.totalSavingsPercent}% OK but some fixtures below target`
        : `FAIL — global ${report.totalSavingsPercent}% < target ${report.targetPercent}%`
  );

  const failed = report.rows.filter((r) => !r.pass && r.tokensRaw >= 50);
  if (failed.length > 0) {
    lines.push('');
    lines.push('Below target:');
    for (const row of failed) {
      lines.push(`  ${row.name} (${row.savingsPercent}%)`);
    }
  }

  return lines.join('\n');
}

export function listFixtureFiles(fixturesDir = defaultFixturesDir()): string[] {
  if (!existsSync(fixturesDir)) return [];
  return readdirSync(fixturesDir).filter((f) => f !== 'manifest.json');
}
