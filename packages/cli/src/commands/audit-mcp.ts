import { existsSync, readFileSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';

const TOKENS_PER_TOOL = 350;

export interface McpServerAudit {
  name: string;
  source: string;
  toolCount: number;
  estimatedTokensPerStep: number;
}

export interface McpAuditReport {
  servers: McpServerAudit[];
  totalTools: number;
  estimatedTokensPerStep: number;
  recommendations: string[];
}

function readJson(path: string): unknown | null {
  if (!existsSync(path)) return null;
  try {
    return JSON.parse(readFileSync(path, 'utf8')) as unknown;
  } catch {
    return null;
  }
}

function countToolsFromServer(server: unknown): number {
  if (!server || typeof server !== 'object') return 0;
  const obj = server as Record<string, unknown>;
  if (Array.isArray(obj.tools)) return obj.tools.length;
  if (typeof obj.toolCount === 'number') return obj.toolCount;
  return 0;
}

function extractServers(data: unknown, source: string): McpServerAudit[] {
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const results: McpServerAudit[] = [];

  const buckets: Array<[string, unknown]> = [];
  if (obj.mcpServers && typeof obj.mcpServers === 'object') {
    for (const [name, server] of Object.entries(obj.mcpServers as Record<string, unknown>)) {
      buckets.push([name, server]);
    }
  }
  if (Array.isArray(obj.servers)) {
    for (const server of obj.servers) {
      if (server && typeof server === 'object') {
        const name = String((server as Record<string, unknown>).name ?? 'server');
        buckets.push([name, server]);
      }
    }
  }

  for (const [name, server] of buckets) {
    const toolCount = Math.max(countToolsFromServer(server), 1);
    results.push({
      name,
      source,
      toolCount,
      estimatedTokensPerStep: toolCount * TOKENS_PER_TOOL,
    });
  }

  return results;
}

function scanSettingsMcp(settingsPath: string): McpServerAudit[] {
  const data = readJson(settingsPath);
  if (!data || typeof data !== 'object') return [];
  const obj = data as Record<string, unknown>;
  const results: McpServerAudit[] = [];

  for (const [key, value] of Object.entries(obj)) {
    if (!/mcp/i.test(key)) continue;
    if (value && typeof value === 'object') {
      results.push(...extractServers(value, settingsPath));
    }
  }

  return results;
}

export function runAuditMcp(opts: { workspace?: string; json?: boolean } = {}): string {
  const workspace = opts.workspace ?? process.cwd();
  const paths = [
    join(homedir(), '.cursor', 'mcp.json'),
    join(workspace, '.cursor', 'mcp.json'),
    join(homedir(), '.copilot', 'mcp.json'),
    join(homedir(), 'Library', 'Application Support', 'Code', 'User', 'settings.json'),
    join(homedir(), '.config', 'Code', 'User', 'settings.json'),
    join(homedir(), '.claude.json'),
  ];

  const servers: McpServerAudit[] = [];
  for (const file of paths) {
    const data = readJson(file);
    if (file.endsWith('settings.json')) {
      servers.push(...scanSettingsMcp(file));
    } else if (data) {
      servers.push(...extractServers(data, file));
    }
  }

  const deduped = new Map<string, McpServerAudit>();
  for (const server of servers) {
    const key = `${server.name}:${server.source}`;
    deduped.set(key, server);
  }
  const unique = [...deduped.values()].sort(
    (a, b) => b.estimatedTokensPerStep - a.estimatedTokensPerStep
  );

  const totalTools = unique.reduce((sum, s) => sum + s.toolCount, 0);
  const estimatedTokensPerStep = unique.reduce((sum, s) => sum + s.estimatedTokensPerStep, 0);

  const recommendations: string[] = [];
  if (unique.length === 0) {
    recommendations.push('No MCP config files found — overhead may still come from IDE defaults.');
  } else {
    if (estimatedTokensPerStep > 15000) {
      recommendations.push(
        'High MCP overhead (>15K tokens/step). Disable unused servers in /mcp or IDE settings.'
      );
    }
    if (unique.some((s) => /playwright|browser/i.test(s.name))) {
      recommendations.push('Browser/Playwright MCP is heavy — disable when not doing UI tests.');
    }
    if (unique.some((s) => /github/i.test(s.name))) {
      recommendations.push('Prefer `gh` CLI for diffs/PR data instead of GitHub MCP when possible.');
    }
    if (totalTools > 80) {
      recommendations.push('>80 MCP tools active — trim servers to keep context healthy.');
    }
  }

  const report: McpAuditReport = {
    servers: unique,
    totalTools,
    estimatedTokensPerStep,
    recommendations,
  };

  if (opts.json) {
    return JSON.stringify(report, null, 2);
  }

  const lines = ['# MCP audit', ''];
  if (!unique.length) {
    lines.push('No MCP servers detected in known config paths.');
    lines.push('');
    lines.push('Checked: ~/.cursor/mcp.json, .cursor/mcp.json, VS Code settings, ~/.claude.json');
    return lines.join('\n');
  }

  lines.push(`Estimated overhead: ~${estimatedTokensPerStep.toLocaleString()} tokens per agent step`);
  lines.push(`Total tools: ${totalTools} across ${unique.length} server(s)`);
  lines.push('');
  lines.push('| Server | Tools | Est. tokens/step | Source |');
  lines.push('|--------|------:|-----------------:|--------|');
  for (const s of unique) {
    lines.push(
      `| ${s.name} | ${s.toolCount} | ~${s.estimatedTokensPerStep.toLocaleString()} | \`${s.source}\` |`
    );
  }
  lines.push('');
  if (recommendations.length) {
    lines.push('## Recommendations');
    for (const rec of recommendations) {
      lines.push(`- ${rec}`);
    }
  }
  return lines.join('\n');
}
