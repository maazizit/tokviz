import {
  captureLiveFixtures,
  formatBenchReport,
  loadFixtures,
  runBenchmark,
  type BenchReport,
} from '@tokviz/core';

export function runBenchReport(options: {
  live?: boolean;
  repo?: string;
  target?: number;
}): BenchReport {
  const fixtures = loadFixtures();
  if (options.live) {
    const repo = options.repo ?? process.cwd();
    fixtures.push(...captureLiveFixtures(repo));
  }
  return runBenchmark(fixtures, options.target ?? 60);
}

export function runBench(options: {
  live?: boolean;
  repo?: string;
  target?: number;
  json?: boolean;
}): string {
  const report = runBenchReport(options);
  if (options.json) return JSON.stringify(report, null, 2);
  const header = options.live ? `Repo: ${options.repo ?? process.cwd()}\n\n` : '';
  return header + formatBenchReport(report);
}
