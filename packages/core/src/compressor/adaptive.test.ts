import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import {
  estimateOutputSize,
  nextCompressionLevel,
  resolveCompressionLevel,
  shouldEscalateCompression,
} from './adaptive.js';

describe('adaptive compression', () => {
  it('escalates level for large outputs', () => {
    assert.equal(resolveCompressionLevel(500, 20), 'normal');
    assert.equal(resolveCompressionLevel(1500, 90), 'aggressive');
    assert.equal(resolveCompressionLevel(7000, 500), 'emergency');
  });

  it('requests escalation when savings are low', () => {
    assert.equal(shouldEscalateCompression(2000, 1500, 'normal'), true);
    assert.equal(shouldEscalateCompression(2000, 500, 'normal'), false);
    assert.equal(shouldEscalateCompression(200, 150, 'normal'), false);
  });

  it('steps compression levels', () => {
    assert.equal(nextCompressionLevel('normal'), 'aggressive');
    assert.equal(nextCompressionLevel('aggressive'), 'emergency');
  });

  it('estimates output size', () => {
    const size = estimateOutputSize('hello world\n'.repeat(10));
    assert.ok(size.tokens > 0);
    assert.ok(size.lines >= 10);
  });
});
