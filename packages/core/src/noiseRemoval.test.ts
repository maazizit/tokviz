import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compressShellOutput } from './compressor/shell.js';
import { removeNoise } from './noiseRemoval.js';
import { estimateTokens } from './tokens.js';

function savingsPercent(raw: string, compressed: string): number {
  const tokensRaw = estimateTokens(raw);
  const tokensOut = estimateTokens(compressed);
  if (tokensRaw === 0) return 0;
  return Math.round(((tokensRaw - tokensOut) / tokensRaw) * 100);
}

describe('removeNoise aggressive mode', () => {
  it('strips separator lines', () => {
    const raw = ['ok', '────────────', 'done', '========', 'end'].join('\n');
    const out = removeNoise(raw, 'aggressive');
    assert.equal(out, 'ok\ndone\nend');
  });

  it('strips spinner and npm-style progress lines', () => {
    const raw = [
      '⠋ Installing dependencies',
      '[##########--------] 55%',
      '42/100',
      'package installed',
    ].join('\n');
    const out = removeNoise(raw, 'aggressive');
    assert.ok(out.includes('package installed'));
    assert.ok(!out.includes('Installing'));
    assert.ok(!out.includes('55%'));
  });

  it('lite mode keeps separators', () => {
    const raw = ['ok', '────────────', 'done'].join('\n');
    const out = removeNoise(raw, 'lite');
    assert.ok(out.includes('────────────'));
  });

  it('preserves diff deletion markers', () => {
    const raw = '-  const removed = true;';
    assert.equal(removeNoise(raw, 'aggressive'), raw);
  });

  it('achieves 15-25% savings on noisy shell output alone', () => {
    const noisy = [
      ...Array.from({ length: 40 }, (_, i) => `output line ${i} with data payload`),
      '────────────────────────',
      ...Array.from({ length: 4 }, () => '⠋ Building module'),
      ...Array.from({ length: 4 }, () => '2026-06-11T14:32:00.123Z INFO: step complete'),
      '[====================] 100%',
      '42/100',
      'actual build output line 1',
      'actual build output line 2',
      '────────────────────────',
    ].join('\n');

    const lite = removeNoise(noisy, 'lite');
    const aggressive = removeNoise(noisy, 'aggressive');

    const litePct = savingsPercent(noisy, lite);
    const aggressivePct = savingsPercent(noisy, aggressive);

    assert.ok(litePct >= 3 && litePct <= 10, `lite=${litePct}%`);
    assert.ok(aggressivePct >= 15 && aggressivePct <= 25, `aggressive=${aggressivePct}%`);
    assert.ok(aggressivePct > litePct);
    assert.ok(aggressive.includes('actual build output'));
  });

  it('raises global shell savings toward 20-25% on mixed events', () => {
    const noisyBuild = [
      ...Array.from({ length: 28 }, (_, i) => `compile step ${i} ok`),
      '────────────────',
      '⠋ Resolving packages',
      '[########--------] 60%',
      '12/20',
      ...Array.from({ length: 4 }, () => '2026-06-11T14:32:00.123Z INFO: fetched pkg'),
      'added 42 packages',
    ].join('\n');

    const scenarios: Array<{ cmd: string; raw: string }> = [
      ...Array.from({ length: 70 }, (_, i) => ({
        cmd: 'echo hello',
        raw: `hello ${i}\n`,
      })),
      ...Array.from({ length: 18 }, () => ({
        cmd: 'node build.js',
        raw: noisyBuild,
      })),
      {
        cmd: 'git diff',
        raw: [
          'diff --git a/x.ts b/x.ts',
          'index aaa..bbb 100644',
          '--- a/x.ts',
          '+++ b/x.ts',
          '@@ -1,6 +1,6 @@',
          ...Array.from({ length: 3 }, (_, i) => ` context ${i}`),
          '-old',
          '+new',
        ].join('\n'),
      },
    ];

    let rawTotal = 0;
    let savedTotal = 0;

    for (const { cmd, raw } of scenarios) {
      const result = compressShellOutput(cmd, raw);
      rawTotal += result.tokensRaw;
      savedTotal += Math.max(0, result.tokensRaw - result.tokensOptimized);
    }

    const globalPct = rawTotal > 0 ? Math.round((savedTotal / rawTotal) * 100) : 0;
    assert.ok(globalPct >= 20 && globalPct <= 25, `global=${globalPct}%`);
  });
});
