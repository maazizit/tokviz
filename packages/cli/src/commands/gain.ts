import { getGlobalStats, getAllEvents } from '@tokviz/core';

export function runGain(): string {
  const global = getGlobalStats();
  const events = getAllEvents();

  const byCommand = new Map<string, { raw: number; saved: number }>();
  for (const e of events) {
    if (!e.command || e.tokensSaved <= 0) continue;
    const key = e.command.split(/\s+/).slice(0, 2).join(' ');
    const entry = byCommand.get(key) ?? { raw: 0, saved: 0 };
    entry.raw += e.tokensRaw;
    entry.saved += e.tokensSaved;
    byCommand.set(key, entry);
  }

  const top = [...byCommand.entries()].sort((a, b) => b[1].saved - a[1].saved).slice(0, 5);

  const lines: string[] = [
    'TokViz — Token Savings',
    '─'.repeat(40),
    `Raw:       ${global.totalRaw.toLocaleString()} tokens`,
    `Optimized: ${global.totalOptimized.toLocaleString()} tokens`,
    `Saved:     ${global.totalSaved.toLocaleString()} tokens (${global.savingsPercent}%)`,
    '',
  ];

  if (top.length > 0) {
    lines.push('Top savings:');
    for (const [cmd, stats] of top) {
      const pct = stats.raw > 0 ? Math.round((stats.saved / stats.raw) * 1000) / 10 : 0;
      lines.push(`  ${cmd.padEnd(16)} -${stats.saved.toLocaleString()} (${pct}%)`);
    }
  } else {
    lines.push('No savings recorded yet. Hooks compress shell output automatically.');
  }

  return lines.join('\n');
}
