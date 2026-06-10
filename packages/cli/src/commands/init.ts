import { cpSync, existsSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { saveConfig } from '@tokviz/core';
import {
  installHookScripts,
  mergeHooksFile,
  mergeCopilotVsCodeHooks,
  cursorHooksPayload,
  copilotVsCodeHooksPayload,
  geminiHooksPayload,
} from '../hooks-merge.js';
import { cursorHooksPath, copilotHooksPath, geminiHooksPath, REPO_ROOT } from '../paths.js';

export type AgentName = 'cursor' | 'copilot' | 'gemini';

export interface InitOptions {
  global: boolean;
  agent: AgentName;
  prose?: 'lite' | 'full' | 'ultra' | 'off';
  enterprise?: boolean;
  trackOnly?: boolean;
}

function copySkillsAndRules(targetDir: string, prose?: string): void {
  if (prose && prose !== 'off') {
    const skillsSrc = join(REPO_ROOT, 'skills');
    const rulesSrc = join(REPO_ROOT, 'rules', 'cursor');
    const skillsDest = join(targetDir, '.cursor', 'skills');
    const rulesDest = join(targetDir, '.cursor', 'rules');
    mkdirSync(skillsDest, { recursive: true });
    mkdirSync(rulesDest, { recursive: true });
    for (const skill of ['tokviz-compress', 'tokviz-stats']) {
      const src = join(skillsSrc, skill);
      if (existsSync(src)) {
        cpSync(src, join(skillsDest, skill), { recursive: true });
      }
    }
    const ruleFile = join(rulesSrc, 'tokviz.mdc');
    if (existsSync(ruleFile)) {
      cpSync(ruleFile, join(rulesDest, 'tokviz.mdc'));
    }
  }
}

export function runInit(opts: InitOptions): { hooksPath: string; messages: string[] } {
  const messages: string[] = [];
  const agentKey = opts.agent;

  installHookScripts(agentKey);

  let hooksPath: string;
  let payload;

  switch (opts.agent) {
    case 'copilot':
      hooksPath = copilotHooksPath(opts.global);
      mergeCopilotVsCodeHooks(hooksPath, copilotVsCodeHooksPayload(agentKey));
      messages.push(`Hooks merged → ${hooksPath}`);
      if (opts.enterprise || opts.trackOnly) {
        saveConfig({
          enterpriseMode: !!opts.enterprise,
          noContentLog: !!opts.enterprise,
          trackOnly: !!opts.trackOnly,
        });
        messages.push(
          opts.enterprise
            ? 'Enterprise mode: no content log, metrics only'
            : 'Track-only mode: no shell compression',
        );
      }
      messages.push(`Restart ${opts.agent} to activate hooks.`);
      return { hooksPath, messages };
    case 'gemini':
      hooksPath = geminiHooksPath(opts.global);
      payload = geminiHooksPayload(agentKey);
      break;
    default:
      hooksPath = cursorHooksPath(opts.global);
      payload = cursorHooksPayload(agentKey);
  }

  mergeHooksFile(hooksPath, payload);
  messages.push(`Hooks merged → ${hooksPath}`);

  if (opts.enterprise || opts.trackOnly) {
    saveConfig({
      enterpriseMode: !!opts.enterprise,
      noContentLog: !!opts.enterprise,
      trackOnly: !!opts.trackOnly,
    });
    messages.push(
      opts.enterprise
        ? 'Enterprise mode: no content log, metrics only'
        : 'Track-only mode: no shell compression'
    );
  }

  if (!opts.global && opts.prose && opts.prose !== 'off') {
    copySkillsAndRules(process.cwd(), opts.prose);
    messages.push(`Prose mode "${opts.prose}" → .cursor/skills + rules`);
  } else if (opts.global && opts.prose && opts.prose !== 'off') {
    messages.push(
      'Prose skills: run from project root or copy skills/ manually for global prose mode'
    );
  }

  messages.push(`Restart ${opts.agent} to activate hooks.`);

  return { hooksPath, messages };
}
