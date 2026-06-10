import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
  chmodSync,
} from 'node:fs';
import { dirname, join } from 'node:path';
import { TOKVIZ_HOME, REPO_ROOT } from './paths.js';

interface HookEntry {
  type: string;
  command: string;
}

interface HookMatcher {
  matcher?: string;
  hooks?: HookEntry[];
  /** RTK / legacy flat format */
  command?: string;
  type?: string;
}

interface HooksFile {
  version?: number;
  hooks: Record<string, HookMatcher[]>;
}

const TOKVIZ_MARKER = 'tokviz';

function normalizeMatcher(raw: HookMatcher): HookMatcher {
  if (raw.hooks && Array.isArray(raw.hooks)) {
    return { matcher: raw.matcher, hooks: raw.hooks };
  }
  if (typeof raw.command === 'string') {
    return {
      matcher: raw.matcher,
      hooks: [{ type: raw.type ?? 'command', command: raw.command }],
    };
  }
  return { matcher: raw.matcher, hooks: [] };
}

function readHooks(path: string): HooksFile {
  if (!existsSync(path)) return { version: 1, hooks: {} };
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as HooksFile;
    const normalized: HooksFile = { version: parsed.version ?? 1, hooks: {} };
    for (const [event, matchers] of Object.entries(parsed.hooks ?? {})) {
      normalized.hooks[event] = (matchers ?? []).map(normalizeMatcher);
    }
    return normalized;
  } catch {
    return { version: 1, hooks: {} };
  }
}

function writeHooks(path: string, data: HooksFile): void {
  mkdirSync(dirname(path), { recursive: true });
  writeFileSync(path, JSON.stringify(data, null, 2) + '\n', 'utf8');
}

function isTokvizHook(entry: { command: string }): boolean {
  return entry.command.includes(TOKVIZ_MARKER);
}

function mergeMatchers(
  existing: HookMatcher[] | undefined,
  incoming: HookMatcher[]
): HookMatcher[] {
  const result = [...(existing ?? [])].map((m) => {
    const norm = normalizeMatcher(m);
    return {
      matcher: norm.matcher,
      hooks: (norm.hooks ?? []).filter((h) => !isTokvizHook(h)),
    };
  });

  for (const inc of incoming) {
    const normInc = normalizeMatcher(inc);
    const idx = result.findIndex((r) => r.matcher === normInc.matcher);
    if (idx >= 0) {
      result[idx] = {
        matcher: normInc.matcher,
        hooks: [...(result[idx].hooks ?? []), ...(normInc.hooks ?? [])],
      };
    } else {
      result.push({
        matcher: normInc.matcher,
        hooks: normInc.hooks ?? [],
      });
    }
  }
  return result;
}

export function installHookScripts(agent: string): void {
  const src = join(REPO_ROOT, 'hooks', agent, 'hook.sh');
  const destDir = join(TOKVIZ_HOME, 'hooks', agent);
  const dest = join(destDir, 'hook.sh');
  mkdirSync(destDir, { recursive: true });
  copyFileSync(src, dest);
  try {
    chmodSync(dest, 0o755);
  } catch {
    // chmod optional on Windows
  }
}

function hookCommand(agent: string): string {
  return join(TOKVIZ_HOME, 'hooks', agent, 'hook.sh');
}

export function cursorHooksPayload(agent: string): HooksFile {
  const cmd = hookCommand(agent);
  return {
    version: 1,
    hooks: {
      afterChatCreated: [
        {
          hooks: [{ type: 'command', command: cmd }],
        },
      ],
      afterShellExecution: [
        {
          matcher: '*',
          hooks: [{ type: 'command', command: cmd }],
        },
      ],
      afterAgentResponse: [
        {
          hooks: [{ type: 'command', command: cmd }],
        },
      ],
      preToolUse: [
        {
          matcher: 'Shell',
          hooks: [{ type: 'command', command: cmd }],
        },
      ],
    },
  };
}

/** @deprecated Cursor-style payload — use copilotVsCodeHooksPayload for VS Code Copilot */
export function copilotHooksPayload(agent: string): HooksFile {
  const cmd = hookCommand(agent);
  return {
    version: 1,
    hooks: {
      PreToolUse: [
        {
          matcher: 'bash|shell',
          hooks: [{ type: 'command', command: cmd }],
        },
      ],
      PostToolUse: [
        {
          matcher: 'bash|shell',
          hooks: [{ type: 'command', command: cmd }],
        },
      ],
    },
  };
}

export interface VsCodeHookCommand {
  type: string;
  command: string;
  timeout?: number;
}

export interface VsCodeHooksFile {
  hooks: Record<string, VsCodeHookCommand[]>;
}

export function copilotVsCodeHooksPayload(agent: string): VsCodeHooksFile {
  const cmd = hookCommand(agent);
  const entry = { type: 'command', command: cmd, timeout: 15 };
  return {
    hooks: {
      PreToolUse: [entry],
      PostToolUse: [entry],
    },
  };
}

export function mergeCopilotVsCodeHooks(
  targetPath: string,
  incoming: VsCodeHooksFile,
): { path: string; merged: boolean } {
  mkdirSync(dirname(targetPath), { recursive: true });
  let existing: VsCodeHooksFile = { hooks: {} };
  if (existsSync(targetPath)) {
    try {
      existing = JSON.parse(readFileSync(targetPath, 'utf8')) as VsCodeHooksFile;
    } catch {
      existing = { hooks: {} };
    }
  }

  const merged: VsCodeHooksFile = { hooks: { ...existing.hooks } };
  for (const [event, commands] of Object.entries(incoming.hooks)) {
    const current = (merged.hooks[event] ?? []).filter((cmd) => !isTokvizHook(cmd));
    merged.hooks[event] = [...current, ...commands];
  }

  writeFileSync(targetPath, `${JSON.stringify(merged, null, 2)}\n`, 'utf8');
  return { path: targetPath, merged: true };
}

export function geminiHooksPayload(agent: string): HooksFile {
  const cmd = hookCommand(agent);
  return {
    hooks: {
      onConversationStart: [
        {
          hooks: [{ type: 'command', command: cmd }],
        },
      ],
      BeforeTool: [
        {
          matcher: 'shell',
          hooks: [{ type: 'command', command: cmd }],
        },
      ],
      AfterTool: [
        {
          matcher: 'shell',
          hooks: [{ type: 'command', command: cmd }],
        },
      ],
    },
  };
}

export function mergeHooksFile(
  targetPath: string,
  incoming: HooksFile
): { path: string; merged: boolean } {
  const existing = readHooks(targetPath);
  const merged: HooksFile = {
    version: incoming.version ?? existing.version ?? 1,
    hooks: { ...existing.hooks },
  };

  for (const [event, matchers] of Object.entries(incoming.hooks)) {
    merged.hooks[event] = mergeMatchers(merged.hooks[event], matchers);
  }

  writeHooks(targetPath, merged);
  return { path: targetPath, merged: true };
}

export function removeTokvizHooks(targetPath: string): boolean {
  if (!existsSync(targetPath)) return false;
  const data = readHooks(targetPath);
  let changed = false;

  for (const [event, matchers] of Object.entries(data.hooks)) {
    const cleaned = matchers
      .map((m) => {
        const norm = normalizeMatcher(m);
        return {
          matcher: norm.matcher,
          hooks: (norm.hooks ?? []).filter((h) => !isTokvizHook(h)),
        };
      })
      .filter((m) => (m.hooks ?? []).length > 0);
    if (cleaned.length !== matchers.length) changed = true;
    data.hooks[event] = cleaned;
  }

  if (changed) writeHooks(targetPath, data);
  return changed;
}
