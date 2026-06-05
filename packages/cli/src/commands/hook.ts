import { trackShellOutput, trackAgentResponse, trackToolUse } from '@tokviz/core';
import type { Agent } from '@tokviz/core';

interface HookInput {
  hook_event_name?: string;
  conversation_id?: string;
  session_id?: string;
  generation_id?: string;
  tool_name?: string;
  tool_input?: Record<string, unknown>;
  tool_output?: string;
  command?: string;
  output?: string;
  text?: string;
  response?: string;
  cwd?: string;
}

function resolveSessionId(input: HookInput): string {
  return (
    input.conversation_id ??
    input.session_id ??
    input.generation_id ??
    process.env.TOKVIZ_SESSION_ID ??
    'default'
  );
}

function resolveAgent(): Agent {
  const a = process.env.TOKVIZ_AGENT ?? 'cursor';
  if (a === 'copilot' || a === 'gemini' || a === 'cursor') return a;
  return 'cursor';
}

export async function runHook(stdin: string): Promise<string> {
  let input: HookInput = {};
  try {
    input = stdin.trim() ? (JSON.parse(stdin) as HookInput) : {};
  } catch {
    return '{}';
  }

  const event = input.hook_event_name ?? process.env.TOKVIZ_HOOK_EVENT ?? '';
  const sessionId = resolveSessionId(input);
  const agent = resolveAgent();

  try {
    if (event === 'afterShellExecution' || event === 'PostToolUse' || event === 'AfterTool') {
      const command = String(input.command ?? input.tool_input?.command ?? '');
      const output = String(input.output ?? input.tool_output ?? '');
      if (output) {
        const { output: compressed, saved } = trackShellOutput({
          sessionId,
          agent,
          command,
          output,
        });
        if (saved > 0 && compressed !== output) {
          return JSON.stringify({
            updated_mcp_tool_output: compressed,
            tool_output: compressed,
            output: compressed,
          });
        }
      }
    }

    if (event === 'afterAgentResponse') {
      const text = String(input.text ?? input.response ?? '');
      if (text) trackAgentResponse({ sessionId, agent, text });
    }

    if (event === 'preToolUse' || event === 'PreToolUse' || event === 'BeforeTool') {
      const toolName = input.tool_name ?? '';
      if (toolName === 'Shell' || toolName === 'bash' || toolName === 'shell') {
        const command = String(input.tool_input?.command ?? input.command ?? '');
        if (command) {
          trackToolUse({
            sessionId,
            agent,
            toolName: 'Shell',
            inputText: command,
          });
        }
      }
    }
  } catch {
    // fail-open: never block the agent
  }

  return '{}';
}
