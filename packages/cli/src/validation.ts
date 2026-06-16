import { z } from 'zod';
import { ValidationError } from '@tokviz/core';

/**
 * Zod schema for hook input validation.
 * Validates data received from AI agent hooks.
 */
export const HookInputSchema = z.object({
  hook_event_name: z.string().optional(),
  hookEventName: z.string().optional(),
  conversation_id: z.string().optional(),
  session_id: z.string().optional(),
  sessionId: z.string().optional(),
  generation_id: z.string().optional(),
  tool_name: z.string().optional(),
  tool_use_id: z.string().optional(),
  tool_input: z.record(z.string(), z.unknown()).optional(),
  tool_output: z.string().optional(),
  tool_response: z.string().optional(),
  tool_result: z
    .object({
      result_type: z.string().optional(),
      text_result_for_llm: z.string().optional(),
      resultType: z.string().optional(),
      textResultForLlm: z.string().optional(),
    })
    .optional(),
  command: z.string().optional(),
  output: z.string().optional(),
  text: z.string().optional(),
  response: z.string().optional(),
  cwd: z.string().optional(),
});

export type ValidatedHookInput = z.infer<typeof HookInputSchema>;

/**
 * Agent name schema - validates agent identifiers.
 */
export const AgentSchema = z.union([
  z.literal('cursor'),
  z.literal('copilot'),
  z.literal('gemini'),
  z.literal('claude-code'),
  z.literal('windsurf'),
  z.literal('unknown'),
]);

export type ValidatedAgent = z.infer<typeof AgentSchema>;

/**
 * Validate hook input data with Zod.
 * Throws ValidationError if data is invalid.
 */
export function validateHookInput(data: unknown): ValidatedHookInput {
  try {
    return HookInputSchema.parse(data);
  } catch (err) {
    if (err instanceof z.ZodError) {
      const issues = err.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
      throw new ValidationError(`Invalid hook input: ${issues}`);
    }
    throw new ValidationError(`Hook input validation failed: ${String(err)}`);
  }
}

/**
 * Validate agent name.
 * Returns the validated agent, defaults to 'cursor' for invalid values.
 */
export function validateAgent(
  value: unknown
): 'cursor' | 'copilot' | 'gemini' | 'claude-code' | 'windsurf' {
  const result = AgentSchema.safeParse(value);
  if (result.success && result.data !== 'unknown') {
    return result.data;
  }
  return 'cursor'; // Default fallback
}

/**
 * Safe parse that returns a result object instead of throwing.
 */
export function safeParseHookInput(data: unknown): {
  success: boolean;
  data?: ValidatedHookInput;
  error?: string;
} {
  const result = HookInputSchema.safeParse(data);
  if (result.success) {
    return { success: true, data: result.data };
  }
  const issues = result.error.issues.map((i) => `${i.path.join('.')}: ${i.message}`).join(', ');
  return { success: false, error: issues };
}
