import { homedir } from 'node:os';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

export const TOKVIZ_HOME = join(homedir(), '.tokviz');
export const REPO_ROOT =
  process.env.TOKVIZ_REPO_ROOT ??
  join(dirname(fileURLToPath(import.meta.url)), '../../..');

export function cursorHooksPath(global: boolean): string {
  return global
    ? join(homedir(), '.cursor', 'hooks.json')
    : join(process.cwd(), '.cursor', 'hooks.json');
}

export function copilotHooksPath(global: boolean): string {
  return global
    ? join(homedir(), '.copilot', 'hooks', 'tokviz-tracker.json')
    : join(process.cwd(), '.github', 'hooks', 'tokviz-tracker.json');
}

export function geminiHooksPath(global: boolean): string {
  return global
    ? join(homedir(), '.gemini', 'hooks.json')
    : join(process.cwd(), '.gemini', 'hooks.json');
}

export function installedHookScript(agent: string): string {
  return join(TOKVIZ_HOME, 'hooks', agent, 'hook.sh');
}
