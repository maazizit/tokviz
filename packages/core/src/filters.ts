import type { Agent, TokenEvent } from './types.js';

export interface EventFilter {
  since?: string;
  until?: string;
  agent?: Agent;
}

export function parseDateInput(value: string): Date | undefined {
  const trimmed = value.trim();
  if (!trimmed) return undefined;

  const duration = trimmed.match(/^(\d+)(d|h)$/i);
  if (duration) {
    const amount = Number(duration[1]);
    const unit = duration[2].toLowerCase();
    const ms = unit === 'd' ? amount * 86_400_000 : amount * 3_600_000;
    return new Date(Date.now() - ms);
  }

  const parsed = new Date(trimmed);
  return Number.isNaN(parsed.getTime()) ? undefined : parsed;
}

export function filterEvents(events: TokenEvent[], filter: EventFilter = {}): TokenEvent[] {
  const sinceDate = filter.since ? parseDateInput(filter.since) : undefined;
  const untilDate = filter.until ? parseDateInput(filter.until) : undefined;

  return events.filter((event) => {
    const ts = new Date(event.timestamp).getTime();
    if (sinceDate && ts < sinceDate.getTime()) return false;
    if (untilDate && ts > untilDate.getTime()) return false;
    if (filter.agent && event.agent !== filter.agent) return false;
    return true;
  });
}
