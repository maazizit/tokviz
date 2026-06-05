import { getGlobalStats, getSessionStats } from '@tokviz/core';

export function runStats(opts: { json?: boolean; session?: string }): string {
  const sessions = getSessionStats(opts.session);
  const global = getGlobalStats();

  if (opts.json) {
    return JSON.stringify({ global, sessions }, null, 2);
  }

  const lines: string[] = [
    'TokViz — Stats',
    '─'.repeat(40),
    `Events:    ${global.eventCount}`,
    `Sessions:  ${global.sessions}`,
    `Raw:       ${global.totalRaw.toLocaleString()} tokens`,
    `Optimized: ${global.totalOptimized.toLocaleString()} tokens`,
    `Saved:     ${global.totalSaved.toLocaleString()} tokens (${global.savingsPercent}%)`,
    '',
  ];

  if (sessions.length > 0) {
    lines.push('Recent sessions:');
    for (const s of sessions.slice(-5)) {
      lines.push(
        `  ${s.sessionId.slice(0, 12)}…  ${s.agent}  saved ${s.tokensSaved.toLocaleString()} (${s.savingsPercent}%)`
      );
    }
  } else {
    lines.push('No events yet. Use your agent, then run tokviz stats again.');
  }

  return lines.join('\n');
}
