import { getAllEvents, getGlobalStatsForEvents, getSessionStatsForEvents } from './db.js';
import { filterEvents, type EventFilter } from './filters.js';
import { buildRecommendations, type Recommendation } from './recommendations.js';
import type { SessionStats, TokenEvent } from './types.js';

export interface ReportOptions extends EventFilter {
  includeRecommendations?: boolean;
}

export interface ReportData {
  generatedAt: string;
  period: { since?: string; until?: string; agent?: string };
  global: ReturnType<typeof getGlobalStatsForEvents>;
  sessions: SessionStats[];
  byAgent: Array<{ agent: string; tokensIn: number; tokensSaved: number; savingsPercent: number }>;
  bySource: Record<string, number>;
  topCommands: Array<{ command: string; raw: number; saved: number; savingsPercent: number }>;
  extremeSessions: {
    mostExpensive: SessionStats[];
    bestSavings: SessionStats[];
  };
  recommendations: Recommendation[];
}

function topCommands(events: TokenEvent[], limit = 10): ReportData['topCommands'] {
  const byCommand = new Map<string, { raw: number; saved: number }>();

  for (const event of events) {
    if (!event.command) continue;
    const key = event.command.split(/\s+/).slice(0, 2).join(' ');
    const entry = byCommand.get(key) ?? { raw: 0, saved: 0 };
    entry.raw += event.tokensRaw;
    entry.saved += event.tokensSaved;
    byCommand.set(key, entry);
  }

  return [...byCommand.entries()]
    .map(([command, stats]) => ({
      command,
      raw: stats.raw,
      saved: stats.saved,
      savingsPercent: stats.raw > 0 ? Math.round((stats.saved / stats.raw) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.raw - a.raw)
    .slice(0, limit);
}

function aggregateByAgent(sessions: SessionStats[]): ReportData['byAgent'] {
  const map = new Map<string, { tokensIn: number; tokensSaved: number }>();

  for (const session of sessions) {
    const entry = map.get(session.agent) ?? { tokensIn: 0, tokensSaved: 0 };
    entry.tokensIn += session.tokensIn;
    entry.tokensSaved += session.tokensSaved;
    map.set(session.agent, entry);
  }

  return [...map.entries()]
    .map(([agent, stats]) => ({
      agent,
      tokensIn: stats.tokensIn,
      tokensSaved: stats.tokensSaved,
      savingsPercent:
        stats.tokensIn > 0 ? Math.round((stats.tokensSaved / stats.tokensIn) * 1000) / 10 : 0,
    }))
    .sort((a, b) => b.tokensIn - a.tokensIn);
}

function aggregateBySource(events: TokenEvent[]): Record<string, number> {
  const bySource: Record<string, number> = {};
  for (const event of events) {
    bySource[event.source] = (bySource[event.source] ?? 0) + event.tokensRaw;
  }
  return bySource;
}

export function buildReport(opts: ReportOptions = {}): ReportData {
  const events = filterEvents(getAllEvents(), opts);
  const sessions = getSessionStatsForEvents(events);
  const global = getGlobalStatsForEvents(events);
  const recommendations = buildRecommendations(sessions, events, opts);

  const mostExpensive = [...sessions].sort((a, b) => b.tokensIn - a.tokensIn).slice(0, 3);
  const bestSavings = [...sessions]
    .filter((session) => session.tokensIn > 100)
    .sort((a, b) => b.savingsPercent - a.savingsPercent)
    .slice(0, 3);

  return {
    generatedAt: new Date().toISOString(),
    period: { since: opts.since, until: opts.until, agent: opts.agent },
    global,
    sessions,
    byAgent: aggregateByAgent(sessions),
    bySource: aggregateBySource(events),
    topCommands: topCommands(events),
    extremeSessions: { mostExpensive, bestSavings },
    recommendations,
  };
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function formatPeriod(period: ReportData['period']): string {
  const parts: string[] = [];
  if (period.since) parts.push(period.since);
  if (period.until) parts.push(period.until);
  return parts.length > 0 ? parts.join(' → ') : 'all time';
}

export function formatReportMarkdown(data: ReportData): string {
  const lines: string[] = [
    '# TokViz — Rapport tokens',
    '',
    `**Généré :** ${data.generatedAt.slice(0, 19).replace('T', ' ')} UTC`,
    `**Période :** ${formatPeriod(data.period)}`,
    '',
    '## Synthèse',
    '',
    '| Métrique | Valeur |',
    '|----------|--------|',
    `| Sessions | ${data.global.sessions} |`,
    `| Événements | ${data.global.eventCount} |`,
    `| Tokens bruts | ${formatNumber(data.global.totalRaw)} |`,
    `| Tokens optimisés | ${formatNumber(data.global.totalOptimized)} |`,
    `| Économie | ${formatNumber(data.global.totalSaved)} (${data.global.savingsPercent} %) |`,
    '',
  ];

  if (data.byAgent.length > 0) {
    lines.push(
      '## Par agent',
      '',
      '| Agent | Tokens IN | Économie | % |',
      '|-------|-----------|----------|---|'
    );
    for (const row of data.byAgent) {
      lines.push(
        `| ${row.agent} | ${formatNumber(row.tokensIn)} | ${formatNumber(row.tokensSaved)} | ${row.savingsPercent} % |`
      );
    }
    lines.push('');
  }

  if (Object.keys(data.bySource).length > 0) {
    lines.push('## Par source', '', '| Source | Tokens IN |', '|--------|-----------|');
    for (const [source, value] of Object.entries(data.bySource)) {
      lines.push(`| ${source} | ${formatNumber(value)} |`);
    }
    lines.push('');
  }

  if (data.topCommands.length > 0) {
    lines.push(
      '## Top commandes',
      '',
      '| Commande | Brut | Économie | % |',
      '|----------|------|----------|---|'
    );
    for (const row of data.topCommands) {
      lines.push(
        `| \`${row.command}\` | ${formatNumber(row.raw)} | ${formatNumber(row.saved)} | ${row.savingsPercent} % |`
      );
    }
    lines.push('');
  }

  if (data.extremeSessions.mostExpensive.length > 0) {
    lines.push(
      '## Sessions les plus consommatrices',
      '',
      '| Session | Agent | Tokens IN | Économie | % |',
      '|---------|-------|-----------|----------|---|'
    );
    for (const session of data.extremeSessions.mostExpensive) {
      lines.push(
        `| ${session.sessionId.slice(0, 12)}… | ${session.agent} | ${formatNumber(session.tokensIn)} | ${formatNumber(session.tokensSaved)} | ${session.savingsPercent} % |`
      );
    }
    lines.push('');
  }

  if (data.recommendations.length > 0) {
    lines.push('## Recommandations', '');
    for (const rec of data.recommendations) {
      const icon = rec.severity === 'warning' ? '⚠️' : rec.severity === 'action' ? '→' : 'ℹ️';
      lines.push(`- ${icon} ${rec.message}`);
    }
    lines.push('');
  }

  return lines.join('\n');
}

export function formatReportHtml(data: ReportData): string {
  const md = formatReportMarkdown(data);
  const body = md
    .replace(/^# (.+)$/m, '<h1>$1</h1>')
    .replace(/^## (.+)$/gm, '<h2>$1</h2>')
    .replace(/\*\*(.+?)\*\*/g, '<strong>$1</strong>')
    .replace(/^- (.+)$/gm, '<li>$1</li>')
    .replace(/(<li>.*<\/li>\n?)+/g, (block) => `<ul>${block}</ul>`)
    .replace(/\|(.+)\|\n\|[-| ]+\|\n((?:\|.+\|\n?)+)/g, (_match, header: string, rows: string) => {
      const headers = header
        .split('|')
        .filter(Boolean)
        .map((cell: string) => `<th>${cell.trim()}</th>`);
      const bodyRows = rows
        .trim()
        .split('\n')
        .map((row: string) => {
          const cells = row
            .split('|')
            .filter(Boolean)
            .map((cell: string) => `<td>${cell.trim()}</td>`);
          return `<tr>${cells.join('')}</tr>`;
        })
        .join('');
      return `<table><thead><tr>${headers.join('')}</tr></thead><tbody>${bodyRows}</tbody></table>`;
    })
    .replace(/\n\n/g, '<br><br>');

  return `<!DOCTYPE html>
<html lang="fr">
<head>
  <meta charset="utf-8" />
  <title>TokViz Report</title>
  <style>
    body { font-family: system-ui, sans-serif; max-width: 900px; margin: 2rem auto; padding: 0 1rem; color: #1a1a1a; }
    h1 { border-bottom: 2px solid #333; padding-bottom: 0.5rem; }
    h2 { margin-top: 2rem; color: #444; }
    table { border-collapse: collapse; width: 100%; margin: 1rem 0; }
    th, td { border: 1px solid #ddd; padding: 0.5rem 0.75rem; text-align: left; }
    th { background: #f5f5f5; }
    ul { padding-left: 1.5rem; }
    li { margin: 0.4rem 0; }
  </style>
</head>
<body>${body}</body>
</html>`;
}

export function formatReportJson(data: ReportData): string {
  return JSON.stringify(data, null, 2);
}
