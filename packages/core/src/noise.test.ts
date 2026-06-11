import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { dedupeLines, removeNoise } from './noise.js';

describe('removeNoise', () => {
  it('strips ANSI color codes', () => {
    const raw = '\x1b[31merror\x1b[0m: something failed';
    assert.equal(removeNoise(raw), 'error: something failed');
  });

  it('strips ISO timestamps and log levels', () => {
    const raw = '2026-06-11T14:32:00.123Z INFO: Server started';
    assert.equal(removeNoise(raw), 'Server started');
  });

  it('removes progress bars', () => {
    const raw = '[=========>          ] 45% downloading';
    assert.equal(removeNoise(raw), 'downloading');
  });

  it('does not strip diff deletion markers', () => {
    const raw = '-  const removed = true;';
    assert.equal(removeNoise(raw), raw);
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

  it('keeps pairs of duplicate lines', () => {
    const raw = ['dup', 'dup', 'end'].join('\n');
    const out = dedupeLines(raw, 3);
    assert.equal(out, raw);
  });
});
