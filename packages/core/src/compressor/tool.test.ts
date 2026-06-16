import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compressToolOutput } from './tool.js';

describe('compressToolOutput', () => {
  it('samples large GitHub JSON arrays', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      title: `Issue ${i}`,
      number: i,
      url: `https://github.com/org/repo/issues/${i}`,
    }));
    const raw = JSON.stringify(items);
    const result = compressToolOutput('github_search_issues', raw);
    assert.ok(result.compressed);
    assert.ok(result.output.includes('_tokviz'));
    assert.ok(result.tokensOptimized < result.tokensRaw);
  });

  it('truncates long fetch-like text', () => {
    const raw = Array.from({ length: 200 }, (_, i) => `line ${i} content payload`).join('\n');
    const result = compressToolOutput('fetch_url', raw);
    assert.ok(result.compressed);
    assert.ok(result.output.split('\n').length < raw.split('\n').length);
  });

  it('truncates long file reads', () => {
    const raw = Array.from({ length: 200 }, (_, i) => `line ${i}`).join('\n');
    const result = compressToolOutput('Read', raw);
    assert.ok(result.compressed);
    assert.ok(result.output.includes('omitted'));
  });

  it('passes through short output unchanged', () => {
    const raw = '{"ok":true}';
    const result = compressToolOutput('some_tool', raw);
    assert.equal(result.compressed, false);
  });
});
