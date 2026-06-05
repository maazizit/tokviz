import type { SessionStats, TokenEvent } from './types.js';

export interface Recommendation {
  severity: 'info' | 'warning' | 'action';
  message: string;
}

function topCommandShare(events: TokenEvent[]): { command: string; share: number } | null {
  const total = events.reduce((sum, event) => sum + event.tokensRaw, 0);
  if (total === 0) return null;

  const byCommand = new Map<string, number>();
  for (const event of events) {
    if (!event.command) continue;
    const key = event.command.split(/\s+/).slice(0, 2).join(' ');
    byCommand.set(key, (byCommand.get(key) ?? 0) + event.tokensRaw);
  }

  const top = [...byCommand.entries()].sort((a, b) => b[1] - a[1])[0];
  if (!top) return null;

  return { command: top[0], share: Math.round((top[1] / total) * 1000) / 10 };
}

export function buildRecommendations(
  sessions: SessionStats[],
  events: TokenEvent[],
  opts: { includeRecommendations?: boolean } = {}
): Recommendation[] {
  if (opts.includeRecommendations === false) return [];

  const recommendations: Recommendation[] = [];

  if (events.length === 0) {
    recommendations.push({
      severity: 'action',
      message: 'Aucun événement enregistré. Lance `tokviz doctor`, redémarre Cursor, puis refais une session Agent.',
    });
    return recommendations;
  }

  const globalIn = events.reduce((sum, event) => sum + event.tokensRaw, 0);
  const globalSaved = events.reduce((sum, event) => sum + event.tokensSaved, 0);
  const globalSavings = globalIn > 0 ? (globalSaved / globalIn) * 100 : 0;

  if (globalSavings < 15) {
    recommendations.push({
      severity: 'warning',
      message:
        'Économie globale < 15 %. Vérifie les hooks avec `tokviz doctor` et redémarre Cursor après `tokviz init`.',
    });
  }

  const proseIn = events
    .filter((event) => event.source === 'prose')
    .reduce((sum, event) => sum + event.tokensRaw, 0);
  if (globalIn > 0 && (proseIn / globalIn) * 100 > 40) {
    recommendations.push({
      severity: 'action',
      message: 'Prose > 40 % des tokens IN. Active le mode `/tokviz full` ou `/tokviz lite` pour réduire les réponses.',
    });
  }

  const topCommand = topCommandShare(events);
  if (topCommand && topCommand.share > 60) {
    recommendations.push({
      severity: 'action',
      message: `> 60 % des tokens viennent de \`${topCommand.command}\`. Envisage un alias ou un filtre pour cette commande.`,
    });
  }

  const lowSavingsSessions = sessions.filter((session) => session.savingsPercent < 15 && session.tokensIn > 500);
  if (lowSavingsSessions.length > 0) {
    const sample = lowSavingsSessions[0].sessionId.slice(0, 12);
    recommendations.push({
      severity: 'warning',
      message: `Session \`${sample}…\` : économie faible malgré gros volume. Hooks peut-être inactifs pendant cette session.`,
    });
  }

  const byAgent = new Map<string, { in: number; saved: number }>();
  for (const session of sessions) {
    const entry = byAgent.get(session.agent) ?? { in: 0, saved: 0 };
    entry.in += session.tokensIn;
    entry.saved += session.tokensSaved;
    byAgent.set(session.agent, entry);
  }

  const agentRates = [...byAgent.entries()]
    .filter(([, stats]) => stats.in > 0)
    .map(([agent, stats]) => ({ agent, rate: (stats.saved / stats.in) * 100 }));

  if (agentRates.length >= 2) {
    const sorted = [...agentRates].sort((a, b) => b.rate - a.rate);
    if (sorted[0].rate >= sorted[1].rate * 2) {
      recommendations.push({
        severity: 'info',
        message: `Préférer \`${sorted[0].agent}\` pour les tâches shell-heavy (${Math.round(sorted[0].rate)} % vs ${Math.round(sorted[1].rate)} %).`,
      });
    }
  }

  if (recommendations.length === 0) {
    recommendations.push({
      severity: 'info',
      message: 'Consommation stable. Continue à exporter `tokviz stats --json` pour suivre l’évolution.',
    });
  }

  return recommendations;
}
