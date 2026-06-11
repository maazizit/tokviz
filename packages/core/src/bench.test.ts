import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { formatBenchReport, loadFixtures, runBenchmark } from './bench.js';

describe('benchmark fixtures', () => {
  it('loads all manifest fixtures', () => {
    const fixtures = loadFixtures();
    assert.ok(fixtures.length >= 9);
    assert.ok(fixtures.every((f) => f.output.length > 0));
  });

  it('passes 60% benchmark on fixture suite', () => {
    const report = runBenchmark(loadFixtures(), 60);
    assert.ok(report.pass, `global ${report.totalSavingsPercent}%, failed: ${
      report.rows.filter((r) => !r.pass && r.tokensRaw >= 50).map((r) => `${r.name}=${r.savingsPercent}%`).join(', ')
    }`);
    assert.equal(formatBenchReport(report).includes('TokViz'), true);
  });
});
