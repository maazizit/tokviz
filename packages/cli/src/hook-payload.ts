import { createHash } from 'node:crypto';
import { existsSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { getTokvizHome } from '@tokviz/core';

export interface HookInput {
  hook_event_name?: string;
  hookEventName?: string;
  conversation_id?: string;
  session_id?: string;
  sessionId?: string;
  generation_id?: string;
  tool_name?: string;
  tool_use_id?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  tool_response?: string;
  tool_result?: {
    result_type?: string;
    text_result_for_llm?: string;
    resultType?: string;
    textResultForLlm?: string;
  };
  command?: string;
  output?: string;
  text?: string;
  response?: string;
  cwd?: string;
}

const SHELL_TOOL_NAMES = new Set([
  'shell',
  'bash',
  'runterminalcommand',
  'run_terminal_command',
  'runinterminal',
  'run_in_terminal',
  'terminal',
  'executecommand',
  'execute_command',
]);

function pendingDir(): string {
  const dir = join(getTokvizHome(), 'pending-commands');
  if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
  return dir;
}

function pendingKey(sessionId: string, toolUseId?: string): string {
  const raw = `${sessionId}:${toolUseId ?? 'last'}`;
  return createHash('sha256').update(raw).digest('hex').slice(0, 24);
}

export function stashShellCommand(sessionId: string, command: string, toolUseId?: string): void {
  const trimmed = command.trim();
  if (!trimmed) return;
  writeFileSync(join(pendingDir(), `${pendingKey(sessionId, toolUseId)}.cmd`), trimmed, 'utf8');
  writeFileSync(join(pendingDir(), `${pendingKey(sessionId, 'last')}.cmd`), trimmed, 'utf8');
}

export function popShellCommand(sessionId: string, toolUseId?: string): string {
  for (const key of [pendingKey(sessionId, toolUseId), pendingKey(sessionId, 'last')]) {
    const file = join(pendingDir(), `${key}.cmd`);
    if (!existsSync(file)) continue;
    const cmd = readFileSync(file, 'utf8').trim();
    try {
      unlinkSync(file);
    } catch {
      // ignore
    }
    if (cmd) return cmd;
  }
  return '';
}

function readString(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  return '';
}

function commandFromToolInput(toolInput?: Record<string, unknown>): string {
  if (!toolInput) return '';

  const direct = [
    toolInput.command,
    toolInput.cmd,
    toolInput.script,
    toolInput.shell_command,
    toolInput.shellCommand,
    toolInput.executable,
  ]
    .map(readString)
    .find(Boolean);
  if (direct) return direct;

  const args = toolInput.args;
  if (args && typeof args === 'object') {
    const fromArgs = commandFromToolInput(args as Record<string, unknown>);
    if (fromArgs) return fromArgs;
  }

  const commands = toolInput.commands;
  if (Array.isArray(commands)) {
    const joined = commands.map(readString).filter(Boolean).join(' && ');
    if (joined) return joined;
  }

  return '';
}

export function extractShellCommand(input: HookInput): string {
  return (readString(input.command) || commandFromToolInput(input.tool_input)).trim();
}

export function resolveShellCommand(input: HookInput, sessionId: string): string {
  const fromInput = extractShellCommand(input);
  if (fromInput) return fromInput;
  return popShellCommand(sessionId, input.tool_use_id);
}

export function resolveShellOutput(input: HookInput): string {
  return (
    readString(input.output) ||
    readString(input.tool_output) ||
    readString(input.tool_response) ||
    readString(input.tool_result?.text_result_for_llm) ||
    readString(input.tool_result?.textResultForLlm) ||
    ''
  );
}

export function isShellTool(toolName: string): boolean {
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!normalized) return true;
  if (SHELL_TOOL_NAMES.has(normalized)) return true;
  return normalized.includes('terminal') || normalized.includes('shell');
}

/** Non-shell tools whose output can still be compressed (Read, Grep, MCP, …). */
export function isCompressibleTool(toolName: string): boolean {
  if (isShellTool(toolName)) return true;
  const normalized = toolName.toLowerCase().replace(/[^a-z0-9_]/g, '');
  if (!normalized) return false;
  return (
    normalized.includes('read') ||
    normalized.includes('grep') ||
    normalized.includes('glob') ||
    normalized.includes('search') ||
    normalized.includes('semantic') ||
    normalized.includes('file') ||
    normalized.includes('listdir') ||
    normalized.includes('mcp') ||
    normalized.includes('fetch') ||
    normalized.includes('browser')
  );
}

export function wrappedCommandResponse(command: string): Record<string, unknown> {
  return {
    ...okResponseBase(),
    updatedInput: { command },
    updated_input: { command },
  };
}

export function okResponseBase(): Record<string, unknown> {
  return { continue: true };
}

export function compressedHookResponse(compressed: string): Record<string, unknown> {
  return {
    ...okResponseBase(),
    modifiedResult: {
      resultType: 'success',
      textResultForLlm: compressed,
    },
    updated_mcp_tool_output: compressed,
    tool_output: compressed,
    output: compressed,
  };
}
