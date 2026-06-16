import { cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
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
export type ProseMode = 'lite' | 'full' | 'ultra' | 'off';

export interface InitOptions {
  global: boolean;
  agent: AgentName;
  prose?: ProseMode;
  workspace?: string;
  enterprise?: boolean;
  trackOnly?: boolean;
}

const TOKVIZ_COPILOT_START = '<!-- tokviz:start -->';
const TOKVIZ_COPILOT_END = '<!-- tokviz:end -->';

function copySkillsAndRules(targetDir: string, prose?: ProseMode): void {
  if (!prose || prose === 'off') return;

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

  for (const rule of ['tokviz.mdc', 'tokviz-output-default.mdc']) {
    const ruleFile = join(rulesSrc, rule);
    if (existsSync(ruleFile)) {
      cpSync(ruleFile, join(rulesDest, rule));
    }
  }
}

function installCopilotInstructions(targetDir: string): boolean {
  const templatePath = join(REPO_ROOT, 'templates', 'copilot-instructions.md');
  if (!existsSync(templatePath)) return false;

  const destDir = join(targetDir, '.github');
  const destPath = join(destDir, 'copilot-instructions.md');
  const template = readFileSync(templatePath, 'utf8').trim() + '\n';

  mkdirSync(destDir, { recursive: true });

  if (!existsSync(destPath)) {
    writeFileSync(destPath, template, 'utf8');
    return true;
  }

  const existing = readFileSync(destPath, 'utf8');
  if (existing.includes(TOKVIZ_COPILOT_START) && existing.includes(TOKVIZ_COPILOT_END)) {
    const start = existing.indexOf(TOKVIZ_COPILOT_START);
    const end = existing.indexOf(TOKVIZ_COPILOT_END) + TOKVIZ_COPILOT_END.length;
    writeFileSync(destPath, existing.slice(0, start) + template + existing.slice(end), 'utf8');
    return true;
  }

  writeFileSync(destPath, `${existing.trimEnd()}\n\n${template}`, 'utf8');
  return true;
}

function installProseAssets(
  targetDir: string,
  agent: AgentName,
  prose?: ProseMode
): string[] {
  const messages: string[] = [];
  if (!prose || prose === 'off') return messages;

  if (agent === 'cursor') {
    copySkillsAndRules(targetDir, prose);
    messages.push(`Prose mode "${prose}" → ${join(targetDir, '.cursor', 'skills')} + rules`);
  }

  if (agent === 'copilot' || agent === 'cursor') {
    if (installCopilotInstructions(targetDir)) {
      messages.push(`Copilot instructions → ${join(targetDir, '.github', 'copilot-instructions.md')}`);
    }
  }

  return messages;
}

export function runInit(opts: InitOptions): { hooksPath: string; messages: string[] } {
  const messages: string[] = [];
  const agentKey = opts.agent;
  const workspace = opts.workspace ?? (!opts.global ? process.cwd() : undefined);
  const prose = opts.prose ?? 'off';

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
            : 'Track-only mode: no shell compression'
        );
      }
      if (workspace && prose !== 'off') {
        messages.push(...installProseAssets(workspace, opts.agent, prose));
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

  if (workspace && prose !== 'off') {
    messages.push(...installProseAssets(workspace, opts.agent, prose));
  } else if (opts.global && prose !== 'off') {
    messages.push(
      'Prose assets skipped — pass --workspace <project> to install rules/skills/copilot-instructions'
    );
  }

  messages.push(`Restart ${opts.agent} to activate hooks.`);

  return { hooksPath, messages };
}
