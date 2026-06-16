import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { wrapVerboseCommand } from './command-wrapper.js';

describe('wrapVerboseCommand', () => {
  it('wraps npm install with tail', () => {
    const wrapped = wrapVerboseCommand('npm install');
    assert.ok(wrapped?.includes('tail -n 25'));
    assert.ok(wrapped?.includes('npm install'));
  });

  it('does not double-wrap commands that already use tail', () => {
    assert.equal(wrapVerboseCommand('npm install 2>&1 | tail -n 20'), null);
  });

  it('wraps docker build', () => {
    const wrapped = wrapVerboseCommand('docker build -t app .');
    assert.ok(wrapped?.includes('tail -n 30'));
  });
});
