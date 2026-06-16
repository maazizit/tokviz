import { getAllEvents, getSessionStatsForEvents } from './db.js';
import { filterEvents, type EventFilter } from './filters.js';
import type { SessionStats } from './types.js';

export interface CompareOptions extends EventFilter {
  sessions?: string[];
  agents?: string[];
  rank?: 'top';
  limit?: number;
  baseline?: 'median';
  before?: string;
  after?: string;
}

export interface SessionCompareRow {
  sessionId: string;
  agent: string;
  startedAt: string;
  tokensIn: number;
  tokensOut: number;
  tokensSaved: number;
  savingsPercent: number;
  shellRatio: number;
  proseRatio: number;
  eventCount: number;
  costScore: number;
}

export interface CompareResult {
  mode: 'sessions' | 'agents' | 'rank' | 'baseline' | 'before-after';
  rows: SessionCompareRow[];
  delta?: {
    tokensIn: number;
    tokensOut: number;
    tokensSaved: number;
    savingsPercent: number;
  };
  agentSummary?: Array<{
    agent: string;
    tokensIn: number;
    tokensSaved: number;
    savingsPercent: number;
    sessions: number;
  }>;
}

function toRow(session: SessionStats, eventCount: number): SessionCompareRow {
  const shell = session.bySource.shell ?? 0;
  const prose = session.bySource.prose ?? 0;
  const total = session.tokensIn || 1;

  return {
    sessionId: session.sessionId,
    agent: session.agent,
    startedAt: session.startedAt,
    tokensIn: session.tokensIn,
    tokensOut: session.tokensOut,
    tokensSaved: session.tokensSaved,
    savingsPercent: session.savingsPercent,
    shellRatio: Math.round((shell / total) * 1000) / 10,
    proseRatio: Math.round((prose / total) * 1000) / 10,
    eventCount,
    costScore: Math.round(session.tokensIn * (1 - session.savingsPercent / 100)),
  };
}

function countEventsBySession(events: ReturnType<typeof getAllEvents>): Map<string, number> {
  const counts = new Map<string, number>();
  for (const event of events) {
    counts.set(event.sessionId, (counts.get(event.sessionId) ?? 0) + 1);
  }
  return counts;
}

function filterSessions(sessions: SessionStats[], opts: CompareOptions): SessionStats[] {
  let filtered = sessions;

  if (opts.sessions?.length) {
    filtered = filtered.filter((session) => opts.sessions!.includes(session.sessionId));
  }

  if (opts.agents?.length) {
    filtered = filtered.filter((session) => opts.agents!.includes(session.agent));
  }

  if (opts.before || opts.after) {
    const beforeDate = opts.before ? new Date(opts.before) : undefined;
    const afterDate = opts.after ? new Date(opts.after) : undefined;

    filtered = filtered.filter((session) => {
      const ts = new Date(session.startedAt).getTime();
      if (beforeDate && ts >= beforeDate.getTime()) return false;
      if (afterDate && ts < afterDate.getTime()) return false;
      return true;
    });
  }

  return filtered;
}

function buildDelta(a: SessionCompareRow, b: SessionCompareRow): CompareResult['delta'] {
  return {
    tokensIn: a.tokensIn - b.tokensIn,
    tokensOut: a.tokensOut - b.tokensOut,
    tokensSaved: a.tokensSaved - b.tokensSaved,
    savingsPercent: Math.round((a.savingsPercent - b.savingsPercent) * 10) / 10,
  };
}

function aggregateAgents(rows: SessionCompareRow[]): CompareResult['agentSummary'] {
  const map = new Map<string, { tokensIn: number; tokensSaved: number; sessions: number }>();

  for (const row of rows) {
    const entry = map.get(row.agent) ?? { tokensIn: 0, tokensSaved: 0, sessions: 0 };
    entry.tokensIn += row.tokensIn;
    entry.tokensSaved += row.tokensSaved;
    entry.sessions += 1;
    map.set(row.agent, entry);
  }

  return [...map.entries()]
    .map(([agent, stats]) => ({
      agent,
      tokensIn: stats.tokensIn,
      tokensSaved: stats.tokensSaved,
      savingsPercent:
        stats.tokensIn > 0 ? Math.round((stats.tokensSaved / stats.tokensIn) * 1000) / 10 : 0,
      sessions: stats.sessions,
    }))
    .sort((a, b) => b.tokensIn - a.tokensIn);
}

export function runCompare(opts: CompareOptions = {}): CompareResult {
  const events = filterEvents(getAllEvents(), opts);
  const eventCounts = countEventsBySession(events);
  const sessions = filterSessions(getSessionStatsForEvents(events), opts);
  const rows = sessions.map((session) => toRow(session, eventCounts.get(session.sessionId) ?? 0));

  if (opts.rank === 'top') {
    const limit = opts.limit ?? 10;
    const ranked = [...rows].sort((a, b) => b.costScore - a.costScore).slice(0, limit);
    return { mode: 'rank', rows: ranked };
  }

  if (opts.baseline === 'median' && opts.sessions?.length === 1) {
    const target = rows.find((row) => row.sessionId === opts.sessions![0]);
    const others = rows.filter((row) => row.sessionId !== opts.sessions![0]);
    const medianIn =
      others.length > 0
        ? [...others].sort((a, b) => a.tokensIn - b.tokensIn)[Math.floor(others.length / 2)]
            .tokensIn
        : 0;

    const baselineRow: SessionCompareRow = {
      sessionId: 'baseline-median',
      agent: 'baseline',
      startedAt: new Date().toISOString(),
      tokensIn: medianIn,
      tokensOut: medianIn,
      tokensSaved: 0,
      savingsPercent: 0,
      shellRatio: 0,
      proseRatio: 0,
      eventCount: 0,
      costScore: medianIn,
    };

    return {
      mode: 'baseline',
      rows: target ? [target, baselineRow] : [baselineRow],
      delta: target ? buildDelta(target, baselineRow) : undefined,
    };
  }

  if (opts.before && opts.after) {
    const beforeEvents = filterEvents(getAllEvents(), { until: opts.before });
    const afterEvents = filterEvents(getAllEvents(), { since: opts.after });
    const beforeSessions = getSessionStatsForEvents(beforeEvents);
    const afterSessions = getSessionStatsForEvents(afterEvents);

    const beforeTotal = beforeSessions.reduce((sum, session) => sum + session.tokensIn, 0);
    const afterTotal = afterSessions.reduce((sum, session) => sum + session.tokensIn, 0);
    const beforeSaved = beforeSessions.reduce((sum, session) => sum + session.tokensSaved, 0);
    const afterSaved = afterSessions.reduce((sum, session) => sum + session.tokensSaved, 0);

    const beforeRow: SessionCompareRow = {
      sessionId: `before-${opts.before}`,
      agent: 'period',
      startedAt: opts.before,
      tokensIn: beforeTotal,
      tokensOut: beforeTotal - beforeSaved,
      tokensSaved: beforeSaved,
      savingsPercent: beforeTotal > 0 ? Math.round((beforeSaved / beforeTotal) * 1000) / 10 : 0,
      shellRatio: 0,
      proseRatio: 0,
      eventCount: beforeEvents.length,
      costScore: beforeTotal - beforeSaved,
    };

    const afterRow: SessionCompareRow = {
      sessionId: `after-${opts.after}`,
      agent: 'period',
      startedAt: opts.after,
      tokensIn: afterTotal,
      tokensOut: afterTotal - afterSaved,
      tokensSaved: afterSaved,
      savingsPercent: afterTotal > 0 ? Math.round((afterSaved / afterTotal) * 1000) / 10 : 0,
      shellRatio: 0,
      proseRatio: 0,
      eventCount: afterEvents.length,
      costScore: afterTotal - afterSaved,
    };

    return {
      mode: 'before-after',
      rows: [beforeRow, afterRow],
      delta: buildDelta(afterRow, beforeRow),
    };
  }

  if (opts.agents && opts.agents.length >= 2) {
    const agentSummary = aggregateAgents(rows);
    return { mode: 'agents', rows, agentSummary };
  }

  if (opts.sessions && opts.sessions.length === 2) {
    const selected = opts.sessions
      .map((id) => rows.find((row) => row.sessionId === id))
      .filter((row): row is SessionCompareRow => !!row);

    return {
      mode: 'sessions',
      rows: selected,
      delta: selected.length === 2 ? buildDelta(selected[0], selected[1]) : undefined,
    };
  }

  const limit = opts.limit ?? rows.length;
  const recent = [...rows].sort((a, b) => b.startedAt.localeCompare(a.startedAt)).slice(0, limit);

  return {
    mode: 'sessions',
    rows: recent,
    delta: recent.length === 2 ? buildDelta(recent[0], recent[1]) : undefined,
  };
}

function formatNumber(value: number): string {
  return value.toLocaleString('en-US');
}

function formatDelta(value: number, suffix = ''): string {
  const sign = value > 0 ? '+' : '';
  return `${sign}${formatNumber(value)}${suffix}`;
}

export function formatCompareTerminal(result: CompareResult): string {
  const lines: string[] = ['TokViz — Session Compare', '─'.repeat(56), ''];

  if (result.mode === 'agents' && result.agentSummary) {
    lines.push('Par agent:', '');
    lines.push(
      padRow(['AGENT', 'SESSIONS', 'TOKENS_IN', 'SAVED', '%']),
      padRow(['─'.repeat(8), '─'.repeat(8), '─'.repeat(10), '─'.repeat(8), '─'.repeat(5)])
    );
    for (const row of result.agentSummary) {
      lines.push(
        padRow([
          row.agent,
          String(row.sessions),
          formatNumber(row.tokensIn),
          formatNumber(row.tokensSaved),
          `${row.savingsPercent}%`,
        ])
      );
    }
    lines.push('');
  }

  if (result.rows.length > 0) {
    lines.push(
      padRow(['SESSION', 'AGENT', 'IN', 'OUT', 'SAVED', '%', 'SCORE']),
      padRow([
        '─'.repeat(12),
        '─'.repeat(8),
        '─'.repeat(8),
        '─'.repeat(8),
        '─'.repeat(8),
        '─'.repeat(5),
        '─'.repeat(8),
      ])
    );

    for (const row of result.rows) {
      lines.push(
        padRow([
          `${row.sessionId.slice(0, 12)}…`,
          row.agent,
          formatNumber(row.tokensIn),
          formatNumber(row.tokensOut),
          formatNumber(row.tokensSaved),
          `${row.savingsPercent}%`,
          formatNumber(row.costScore),
        ])
      );
    }
    lines.push('');
  } else {
    lines.push('Aucune session trouvée pour cette comparaison.');
    lines.push('');
  }

  if (result.delta && result.rows.length === 2) {
    lines.push('Delta (A − B):');
    lines.push(`  Tokens IN:    ${formatDelta(result.delta.tokensIn)}`);
    lines.push(`  Tokens OUT:   ${formatDelta(result.delta.tokensOut)}`);
    lines.push(`  Saved:        ${formatDelta(result.delta.tokensSaved)}`);
    lines.push(`  Savings %:    ${formatDelta(result.delta.savingsPercent, ' pts')}`);
    lines.push('');
  }

  return lines.join('\n');
}

export function formatCompareMarkdown(result: CompareResult): string {
  const lines = [formatCompareTerminal(result)];
  if (result.rows.length === 2) {
    const [a, b] = result.rows;
    if (a.savingsPercent > b.savingsPercent + 5) {
      lines.push(
        `Verdict: Session \`${a.sessionId.slice(0, 12)}…\` économise plus (${a.savingsPercent}% vs ${b.savingsPercent}%).`
      );
    } else if (b.savingsPercent > a.savingsPercent + 5) {
      lines.push(
        `Verdict: Session \`${b.sessionId.slice(0, 12)}…\` économise plus (${b.savingsPercent}% vs ${a.savingsPercent}%).`
      );
    }
  }
  return lines.join('\n');
}

function padRow(cells: string[]): string {
  const widths = [14, 10, 10, 10, 10, 7, 10];
  return cells.map((cell, index) => cell.padEnd(widths[index] ?? 10)).join('  ');
}

export function formatCompareJson(result: CompareResult): string {
  return JSON.stringify(result, null, 2);
}
