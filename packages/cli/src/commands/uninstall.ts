import { removeTokvizHooks } from '../hooks-merge.js';
import { cursorHooksPath, copilotHooksPath, geminiHooksPath } from '../paths.js';
import type { AgentName } from './init.js';

export function runUninstall(opts: { global: boolean; agent: AgentName }): string[] {
  const paths: Record<AgentName, string> = {
    cursor: cursorHooksPath(opts.global),
    copilot: copilotHooksPath(opts.global),
    gemini: geminiHooksPath(opts.global),
  };

  const path = paths[opts.agent];
  const removed = removeTokvizHooks(path);
  return removed ? [`Removed TokViz hooks from ${path}`] : [`No TokViz hooks found in ${path}`];
}
