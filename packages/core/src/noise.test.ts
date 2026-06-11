import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dedupeLines } from './noise.js';
import { removeNoise } from './noiseRemoval.js';

describe('removeNoise', () => {
  it('strips ANSI color codes', () => {
    const raw = '\x1b[31merror\x1b[0m: something failed';
    assert.equal(removeNoise(raw), 'error: something failed');
  });

  it('strips ISO timestamps and INFO log levels', () => {
    const raw = '2026-06-11T14:32:00.123Z INFO: Server started';
    assert.equal(removeNoise(raw, 'lite'), 'Server started');
  });

  it('preserves ERROR and WARN log levels', () => {
    const raw = '2026-06-11T14:33:00.000Z ERROR: database failed';
    assert.equal(removeNoise(raw), 'ERROR: database failed');
  });

  it('removes progress bars', () => {
    const raw = '[=========>          ] 45% downloading';
    assert.equal(removeNoise(raw), 'downloading');
  });

  it('does not strip diff deletion markers', () => {
    const raw = '-  const removed = true;';
    assert.equal(removeNoise(raw, 'aggressive'), raw);
  });
});

describe('dedupeLines', () => {
  it('collapses 3+ identical consecutive lines', () => {
    const raw = ['same', 'same', 'same', 'same', 'other'].join('\n');
    const out = dedupeLines(raw, 3);
    assert.match(out, /duplicate lines omitted/);
    assert.equal(out.split('\n').filter((l) => l === 'same').length, 1);
    assert.ok(out.includes('other'));
  });

  it('keeps pairs of duplicate lines at threshold 3', () => {
    const raw = ['dup', 'dup', 'end'].join('\n');
    const out = dedupeLines(raw, 3);
    assert.equal(out, raw);
  });

  it('collapses pairs at threshold 2', () => {
    const raw = ['dup', 'dup', 'end'].join('\n');
    const out = dedupeLines(raw, 2);
    assert.match(out, /duplicate lines omitted/);
    assert.ok(!out.includes('dup\ndup'));
  });
});
