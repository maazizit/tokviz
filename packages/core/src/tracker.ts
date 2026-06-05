import { recordEvent } from './db.js';
import { compressShellOutput } from './compressor/shell.js';
import { estimateTokens, redactSecrets } from './tokens.js';
import type { Agent, EventSource } from './types.js';
import { getConfig } from './db.js';

export function trackShellOutput(input: {
  sessionId: string;
  agent: Agent;
  command: string;
  output: string;
  trackOnly?: boolean;
}): { output: string; saved: number } {
  const config = getConfig();
  const trackOnly = input.trackOnly ?? config.trackOnly;
  const safeOutput = redactSecrets(input.output);
  const safeCommand = config.noContentLog ? '[redacted]' : input.command;

  if (trackOnly) {
    const tokens = estimateTokens(safeOutput);
    recordEvent({
      sessionId: input.sessionId,
      agent: input.agent,
      source: 'shell',
      toolName: 'Shell',
      command: safeCommand,
      tokensRaw: tokens,
      tokensOptimized: tokens,
    });
    return { output: input.output, saved: 0 };
  }

  const result = compressShellOutput(input.command, safeOutput);
  recordEvent({
    sessionId: input.sessionId,
    agent: input.agent,
    source: 'shell',
    toolName: 'Shell',
    command: safeCommand,
    tokensRaw: result.tokensRaw,
    tokensOptimized: result.tokensOptimized,
    metadata: { compressed: result.compressed },
  });

  return {
    output: result.compressed ? result.output : input.output,
    saved: result.tokensRaw - result.tokensOptimized,
  };
}

export function trackAgentResponse(input: {
  sessionId: string;
  agent: Agent;
  text: string;
  source?: EventSource;
  toolName?: string;
}): void {
  const tokens = estimateTokens(redactSecrets(input.text));
  recordEvent({
    sessionId: input.sessionId,
    agent: input.agent,
    source: input.source ?? 'prose',
    toolName: input.toolName,
    tokensRaw: tokens,
    tokensOptimized: tokens,
  });
}

export function trackToolUse(input: {
  sessionId: string;
  agent: Agent;
  toolName: string;
  inputText: string;
  outputText?: string;
}): void {
  const raw = estimateTokens(redactSecrets(input.inputText));
  const out = input.outputText ? estimateTokens(redactSecrets(input.outputText)) : 0;
  recordEvent({
    sessionId: input.sessionId,
    agent: input.agent,
    source: 'tool',
    toolName: input.toolName,
    tokensRaw: raw + out,
    tokensOptimized: raw + out,
  });
}
