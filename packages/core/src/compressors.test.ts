import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectCommandType, smartCompress } from './compressors.js';
import { estimateTokens } from './tokens.js';

function savingsPercent(raw: string, compressed: string): number {
  const tokensRaw = estimateTokens(raw);
  const tokensOut = estimateTokens(compressed);
  if (tokensRaw === 0) return 0;
  return Math.round(((tokensRaw - tokensOut) / tokensRaw) * 100);
}

describe('detectCommandType', () => {
  it('matches git diff with extra flags', () => {
    assert.equal(detectCommandType('git diff HEAD~1'), 'git diff');
  });

  it('matches cargo test verbose', () => {
    assert.equal(detectCommandType('cargo test --verbose'), 'cargo test');
  });

  it('matches pnpm test', () => {
    assert.equal(detectCommandType('pnpm test --filter core'), 'pnpm test');
  });

  it('matches pytest', () => {
    assert.equal(detectCommandType('python -m pytest tests/'), 'pytest');
  });

  it('matches rg before grep substring', () => {
    assert.equal(detectCommandType('rg "foo" src/'), 'rg');
  });

  it('returns generic for unknown commands', () => {
    assert.equal(detectCommandType('echo hello'), 'generic');
  });
});

describe('smartCompress', () => {
  it('collapses large unified diff deletion blocks', () => {
    const deletions = Array.from({ length: 20 }, (_, i) => `-removed line ${i}`).join('\n');
    const raw = ['diff --git a/x.ts b/x.ts', '@@ -1,5 +1,1 @@', deletions, '+added'].join(
      '\n'
    );

    const out = smartCompress('git diff', raw);
    assert.match(out, /deletions omitted/);
    assert.ok(!out.includes('removed line 19'));
  });

  it('compresses custom git diff format', () => {
    const raw = [
      'packages/foo.ts | 2 +',
      '--- Changes ---',
      'packages/foo.ts',
      '  @@ -1,2 +1,3 @@',
      ' context',
      ' +added',
      ' -removed',
      '+1 -1',
    ].join('\n');

    const out = smartCompress('git diff', raw);
    assert.ok(out.includes('packages/foo.ts'));
    assert.ok(out.includes('+added'));
    assert.ok(!out.includes('context'));
    assert.ok(!out.includes('| 2 +'));
  });

  it('summarizes git status with many tracked files', () => {
    const raw = [
      'On branch main',
      '  (use "git add ..." to update what will be committed)',
      '\tmodified:   a.ts',
      '\tmodified:   b.ts',
      '\tmodified:   c.ts',
      '\tmodified:   d.ts',
      '?? u1',
      '?? u2',
      '?? u3',
      '?? u4',
    ].join('\n');

    const out = smartCompress('git status', raw);
    assert.ok(!out.includes('git add'));
    assert.match(out, /more tracked files/);
    assert.match(out, /Untracked:.*4 files/);
  });

  it('filters git diff to change lines only', () => {
    const raw = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,3 @@',
      ' context line',
      '-old line',
      '+new line',
    ].join('\n');

    const out = smartCompress('git diff', raw);
    assert.ok(out.includes('-old line'));
    assert.ok(out.includes('+new line'));
    assert.ok(!out.includes('context line'));
  });

  it('keeps only test summary when all pass', () => {
    const raw = [
      'test foo ... ok',
      'test bar ... ok',
      'test baz ... ok',
      'test result: ok. 3 passed; 0 failed',
    ].join('\n');

    const out = smartCompress('cargo test', raw);
    assert.ok(out.includes('test result'));
    assert.ok(!out.includes('test foo'));
  });

  it('keeps npm test failures and summary', () => {
    const raw = [
      'PASS src/a.test.ts',
      'FAIL src/b.test.ts',
      '  ● suite › fails',
      '    Error: boom',
      'Test Suites: 1 failed, 1 passed, 2 total',
      'Tests: 1 failed, 3 passed, 4 total',
    ].join('\n');

    const out = smartCompress('npm test', raw);
    assert.ok(out.includes('FAIL'));
    assert.ok(out.includes('Tests:'));
    assert.ok(!out.includes('PASS src/a'));
  });

  it('groups rg matches by file', () => {
    const raw = [
      'src/a.ts:10:smartCompress(cmd)',
      'src/a.ts:20:smartCompress(other)',
      'src/a.ts:30:smartCompress(x)',
      'src/b.ts:5:detectCommandType(cmd)',
      'src/b.ts:8:detectCommandType(y)',
      'src/b.ts:12:detectCommandType(z)',
    ].join('\n');

    const out = smartCompress('rg smartCompress', raw);
    assert.match(out, /src\/a\.ts: \(3 matches\)/);
    assert.ok(!out.includes('src/a.ts:30'));
  });

  it('strips docker log timestamps', () => {
    const raw = '2026-06-11T14:32:00.123Z Server started';
    const out = smartCompress('docker logs mycontainer', raw);
    assert.equal(out, 'Server started');
  });

  it('truncates generic long output', () => {
    const raw = Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n');
    const out = smartCompress('cat big.log', raw);
    assert.match(out, /truncated/);
  });

  it('fail-safe returns raw when filter would empty output', () => {
    const raw = Array.from({ length: 50 }, (_, i) => `plain ${i}`).join('\n');
    const out = smartCompress('git diff', raw);
    assert.equal(out, raw);
  });
});

describe('compression ratio', () => {
  it('achieves >=60% on noisy git diff', () => {
    const context = Array.from({ length: 80 }, (_, i) => ` unchanged line ${i}`).join('\n');
    const raw = [
      'diff --git a/x.ts b/x.ts',
      'index aaa..bbb 100644',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,5 +1,5 @@',
      context,
      '-removed',
      '+added',
    ].join('\n');

    const out = smartCompress('git diff', raw);
    assert.ok(savingsPercent(raw, out) >= 60);
  });

  it('achieves >=60% on verbose test output', () => {
    const passed = Array.from({ length: 40 }, (_, i) => `test case_${i} ... ok`).join('\n');
    const raw = `${passed}\ntest result: ok. 40 passed; 0 failed`;

    const out = smartCompress('cargo test', raw);
    assert.ok(savingsPercent(raw, out) >= 60);
  });

  it('achieves >=50% on repetitive docker logs', () => {
    const line = '2026-06-11T14:32:00.123Z INFO: request handled';
    const raw = Array.from({ length: 30 }, () => line).join('\n');

    const out = smartCompress('docker logs api', raw);
    assert.ok(savingsPercent(raw, out) >= 50);
  });
});
