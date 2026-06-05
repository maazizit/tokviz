import { existsSync, readFileSync } from 'node:fs';
import { getConfig, getTokvizHome, getGlobalStats } from '@tokviz/core';
import { cursorHooksPath, copilotHooksPath, geminiHooksPath } from '../paths.js';

export function runDoctor(): string {
  const config = getConfig();
  const stats = getGlobalStats();
  const lines: string[] = ['TokViz — Doctor', '─'.repeat(40)];

  const home = getTokvizHome();
  lines.push(existsSync(home) ? `✔ ~/.tokviz exists (${home})` : '✗ ~/.tokviz missing — run tokviz init');

  for (const [name, pathFn] of [
    ['cursor', () => cursorHooksPath(true)],
    ['copilot', () => copilotHooksPath(true)],
    ['gemini', () => geminiHooksPath(true)],
  ] as const) {
    const p = pathFn();
    const hookScript = `${home}/hooks/${name}/hook.sh`;
    if (existsSync(p)) {
      const content = existsSync(p) ? 'found' : 'missing';
      const hasTokviz = existsSync(p) && readFileSync(p, 'utf8').includes('tokviz');
      lines.push(hasTokviz ? `✔ ${name} hooks (${p})` : `⚠ ${name} hooks exist but no tokviz entry (${content})`);
    } else {
      lines.push(`○ ${name} hooks not installed`);
    }
    lines.push(existsSync(hookScript) ? `  ✔ hook script` : `  ✗ hook script missing`);
  }

  lines.push('');
  lines.push(`Config: enterprise=${config.enterpriseMode} noContentLog=${config.noContentLog} trackOnly=${config.trackOnly}`);
  lines.push(`Events: ${stats.eventCount} | Saved: ${stats.totalSaved.toLocaleString()} tokens`);

  return lines.join('\n');
}
