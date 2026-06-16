import assert from 'node:assert/strict';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { after, before, describe, it } from 'node:test';
import {
  compressedHookResponse,
  isShellTool,
  resolveShellCommand,
  resolveShellOutput,
  stashShellCommand,
} from './hook-payload.js';

describe('hook payload extraction', () => {
  let previousHome: string | undefined;

  before(() => {
    previousHome = process.env.TOKVIZ_HOME;
    process.env.TOKVIZ_HOME = mkdtempSync(join(tmpdir(), 'tokviz-hook-'));
  });

  after(() => {
    if (process.env.TOKVIZ_HOME) {
      rmSync(process.env.TOKVIZ_HOME, { recursive: true, force: true });
    }
    process.env.TOKVIZ_HOME = previousHome;
  });
  it('reads Copilot tool_result text_result_for_llm', () => {
    const out = resolveShellOutput({
      tool_result: { text_result_for_llm: 'line1\nline2' },
    });
    assert.equal(out, 'line1\nline2');
  });

  it('extracts command from nested tool_input args', () => {
    const cmd = resolveShellCommand(
      {
        tool_input: { args: { command: 'git diff HEAD~1' } },
      },
      'session-1'
    );
    assert.equal(cmd, 'git diff HEAD~1');
  });

  it('stashes command from PreToolUse for PostToolUse', () => {
    stashShellCommand('session-abc', 'cargo test -p core', 'tool-1');
    const cmd = resolveShellCommand({ tool_input: {} }, 'session-abc');
    assert.equal(cmd, 'cargo test -p core');
  });

  it('recognizes runInTerminal as shell tool', () => {
    assert.equal(isShellTool('runInTerminal'), true);
    assert.equal(isShellTool('editFiles'), false);
  });

  it('returns Copilot modifiedResult shape', () => {
    const res = compressedHookResponse('compressed output');
    assert.deepEqual(res.modifiedResult, {
      resultType: 'success',
      textResultForLlm: 'compressed output',
    });
  });
});
