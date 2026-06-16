import { trackShellOutput, trackAgentResponse, trackToolUse, trackToolOutput } from '@tokviz/core';
import type { Agent } from '@tokviz/core';
import {
  compressedHookResponse,
  extractShellCommand,
  isShellTool,
  okResponseBase,
  resolveShellCommand,
  resolveShellOutput,
  stashShellCommand,
  wrappedCommandResponse,
  type HookInput,
} from '../hook-payload.js';
import { wrapVerboseCommand } from '../command-wrapper.js';
import { safeParseHookInput, validateAgent } from '../validation.js';

function okResponse(extra: Record<string, unknown> = {}): string {
  return JSON.stringify({ ...okResponseBase(), ...extra });
}

function resolveSessionId(input: HookInput): string {
  return (
    input.sessionId ??
    input.conversation_id ??
    input.session_id ??
    input.generation_id ??
    process.env.TOKVIZ_SESSION_ID ??
    'default'
  );
}

function resolveAgent(): Agent {
  const agent = process.env.TOKVIZ_AGENT ?? 'cursor';
  return validateAgent(agent);
}

export async function runHook(stdin: string): Promise<string> {
  let input: HookInput = {};
  try {
    const rawInput = stdin.trim() ? JSON.parse(stdin) : {};
    const validation = safeParseHookInput(rawInput);

    if (!validation.success) {
      console.error(`TokViz: Hook input validation warning: ${validation.error}`);
      // Continue with raw input as fallback for backward compatibility
      input = rawInput as HookInput;
    } else {
      input = validation.data as HookInput;
    }
  } catch {
    return okResponse();
  }

  const event = input.hookEventName ?? input.hook_event_name ?? process.env.TOKVIZ_HOOK_EVENT ?? '';
  const sessionId = resolveSessionId(input);
  const agent = resolveAgent();

  try {
    if (event === 'afterShellExecution' || event === 'PostToolUse' || event === 'AfterTool') {
      const toolName = input.tool_name ?? '';
      const output = resolveShellOutput(input);
      if (toolName && !isShellTool(toolName) && !output) {
        return okResponse();
      }

      if (output) {
        if (toolName && !isShellTool(toolName)) {
          const source = /mcp/i.test(toolName) ? 'mcp' : 'tool';
          const { output: compressed, saved } = trackToolOutput({
            sessionId,
            agent,
            toolName,
            output,
            source,
          });
          if (saved > 0 && compressed !== output) {
            return okResponse(compressedHookResponse(compressed));
          }
        } else {
          const command = resolveShellCommand(input, sessionId);
          const { output: compressed, saved } = trackShellOutput({
            sessionId,
            agent,
            command,
            output,
          });
          if (saved > 0 && compressed !== output) {
            return okResponse(compressedHookResponse(compressed));
          }
        }
      }
    }

    if (event === 'afterAgentResponse') {
      const text = String(input.text ?? input.response ?? '');
      if (text) trackAgentResponse({ sessionId, agent, text });
    }

    if (event === 'preToolUse' || event === 'PreToolUse' || event === 'BeforeTool') {
      const toolName = input.tool_name ?? '';
      if (isShellTool(toolName)) {
        const command = extractShellCommand(input);
        if (command) {
          stashShellCommand(sessionId, command, input.tool_use_id);
          trackToolUse({
            sessionId,
            agent,
            toolName: 'Shell',
            inputText: command,
          });

          const wrapped = wrapVerboseCommand(command);
          if (wrapped) {
            stashShellCommand(sessionId, wrapped, input.tool_use_id);
            return okResponse(wrappedCommandResponse(wrapped));
          }
        }
      }
    }
  } catch {
    // fail-open: never block the agent
  }

  return okResponse();
}
