import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { estimateTokens, redactSecrets } from './tokens.js';
import { compressShellOutput } from './compressor/shell.js';

describe('estimateTokens', () => {
  it('returns 0 for empty string', () => {
    assert.equal(estimateTokens(''), 0);
  });

  it('estimates ~4 chars per token', () => {
    assert.equal(estimateTokens('abcd'), 1);
    assert.equal(estimateTokens('abcdefgh'), 2);
  });
});

describe('redactSecrets', () => {
  it('redacts api keys', () => {
    const out = redactSecrets('api_key=supersecret123');
    assert.match(out, /\[REDACTED\]/);
    assert.doesNotMatch(out, /supersecret123/);
  });
});

describe('compressShellOutput', () => {
  it('compresses git diff by stripping context lines', () => {
    const lines = Array.from({ length: 100 }, (_, i) => ` context ${i}`).concat(
      '-removed',
      '+added'
    );
    const raw = lines.join('\n');
    const result = compressShellOutput('git diff', raw);
    assert.ok(result.tokensOptimized < result.tokensRaw);
    assert.ok(result.output.includes('-removed'));
    assert.ok(result.output.includes('+added'));
    assert.ok(!result.output.includes('context 0'));
  });

  it('passes through short output', () => {
    const result = compressShellOutput('echo hello', 'hello');
    assert.equal(result.compressed, false);
  });
});
