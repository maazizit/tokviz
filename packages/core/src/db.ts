import { mkdirSync, readFileSync, writeFileSync, existsSync, renameSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { randomUUID } from 'node:crypto';
import type { Agent, EventSource, SessionStats, TokenEvent, TokVizConfig } from './types.js';
import { DEFAULT_CONFIG } from './types.js';

export function getTokvizHome(): string {
  return process.env.TOKVIZ_HOME ?? join(homedir(), '.tokviz');
}

/** @deprecated Use getTokvizHome() — kept for backward compatibility */
export const TOKVIZ_HOME = join(homedir(), '.tokviz');

const EVENTS_FILE = () => join(getTokvizHome(), 'events.json');
const CONFIG_FILE = () => join(getTokvizHome(), 'config.json');

interface Store {
  events: TokenEvent[];
}

function ensureHome(): void {
  const home = getTokvizHome();
  if (!existsSync(home)) {
    mkdirSync(home, { recursive: true });
  }
}

function readStore(): Store {
  ensureHome();
  if (!existsSync(EVENTS_FILE())) return { events: [] };
  try {
    return JSON.parse(readFileSync(EVENTS_FILE(), 'utf8')) as Store;
  } catch {
    return { events: [] };
  }
}

function writeStore(store: Store): void {
  ensureHome();
  const eventsFile = EVENTS_FILE();
  const tmp = `${eventsFile}.tmp`;
  writeFileSync(tmp, JSON.stringify(store, null, 2), 'utf8');
  renameSync(tmp, eventsFile);
}

export function getConfig(): TokVizConfig {
  ensureHome();
  if (!existsSync(CONFIG_FILE())) return { ...DEFAULT_CONFIG };
  try {
    return { ...DEFAULT_CONFIG, ...JSON.parse(readFileSync(CONFIG_FILE(), 'utf8')) };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function saveConfig(config: Partial<TokVizConfig>): TokVizConfig {
  const merged = { ...getConfig(), ...config };
  ensureHome();
  writeFileSync(CONFIG_FILE(), JSON.stringify(merged, null, 2), 'utf8');
  return merged;
}

export function recordEvent(input: {
  sessionId: string;
  agent: Agent;
  source: EventSource;
  toolName?: string;
  command?: string;
  tokensRaw: number;
  tokensOptimized: number;
  metadata?: Record<string, unknown>;
}): TokenEvent {
  const config = getConfig();
  const event: TokenEvent = {
    id: randomUUID(),
    sessionId: input.sessionId,
    agent: input.agent,
    timestamp: new Date().toISOString(),
    source: input.source,
    toolName: input.toolName,
    command: input.command?.slice(0, 200),
    tokensRaw: input.tokensRaw,
    tokensOptimized: input.tokensOptimized,
    tokensSaved: Math.max(0, input.tokensRaw - input.tokensOptimized),
    metadata: input.metadata,
  };

  const store = readStore();
  store.events.push(event);
  purgeOldEvents(store, config.retentionDays);
  writeStore(store);
  return event;
}

function purgeOldEvents(store: Store, retentionDays: number): void {
  if (retentionDays <= 0) return;
  const cutoff = Date.now() - retentionDays * 86_400_000;
  store.events = store.events.filter((e) => new Date(e.timestamp).getTime() >= cutoff);
}

export function getAllEvents(): TokenEvent[] {
  return readStore().events;
}

export function getSessionStatsForEvents(events: TokenEvent[], sessionId?: string): SessionStats[] {
  const bySession = new Map<string, TokenEvent[]>();

  for (const e of events) {
    if (sessionId && e.sessionId !== sessionId) continue;
    const list = bySession.get(e.sessionId) ?? [];
    list.push(e);
    bySession.set(e.sessionId, list);
  }

  return [...bySession.entries()]
    .map(([sid, evts]) => buildSessionStats(sid, evts))
    .sort((a, b) => a.startedAt.localeCompare(b.startedAt));
}

export function getSessionStats(sessionId?: string): SessionStats[] {
  return getSessionStatsForEvents(getAllEvents(), sessionId);
}

function buildSessionStats(sessionId: string, events: TokenEvent[]): SessionStats {
  const sorted = [...events].sort((a, b) => a.timestamp.localeCompare(b.timestamp));
  let tokensIn = 0;
  let tokensOut = 0;
  let tokensSaved = 0;
  const byTool: SessionStats['byTool'] = {};
  const bySource: SessionStats['bySource'] = {};
  let cumulative = 0;
  const timeline: SessionStats['timeline'] = [];

  for (const e of sorted) {
    tokensIn += e.tokensRaw;
    tokensOut += e.tokensOptimized;
    tokensSaved += e.tokensSaved;
    cumulative += e.tokensSaved;
    timeline.push({ ts: e.timestamp, cumulativeSaved: cumulative });

    bySource[e.source] = (bySource[e.source] ?? 0) + e.tokensRaw;

    const tool = e.toolName ?? e.source;
    const entry = byTool[tool] ?? { in: 0, out: 0, saved: 0 };
    entry.in += e.tokensRaw;
    entry.out += e.tokensOptimized;
    entry.saved += e.tokensSaved;
    byTool[tool] = entry;
  }

  const savingsPercent = tokensIn > 0 ? Math.round((tokensSaved / tokensIn) * 1000) / 10 : 0;

  return {
    sessionId,
    agent: sorted[0]?.agent ?? 'cursor',
    startedAt: sorted[0]?.timestamp ?? new Date().toISOString(),
    tokensIn,
    tokensOut,
    tokensSaved,
    savingsPercent,
    byTool,
    bySource,
    timeline,
  };
}

export function getGlobalStatsForEvents(events: TokenEvent[]): {
  totalRaw: number;
  totalOptimized: number;
  totalSaved: number;
  savingsPercent: number;
  eventCount: number;
  sessions: number;
} {
  const totalRaw = events.reduce((s, e) => s + e.tokensRaw, 0);
  const totalOptimized = events.reduce((s, e) => s + e.tokensOptimized, 0);
  const totalSaved = events.reduce((s, e) => s + e.tokensSaved, 0);
  const sessions = new Set(events.map((e) => e.sessionId)).size;

  return {
    totalRaw,
    totalOptimized,
    totalSaved,
    savingsPercent: totalRaw > 0 ? Math.round((totalSaved / totalRaw) * 1000) / 10 : 0,
    eventCount: events.length,
    sessions,
  };
}

export function getGlobalStats(): {
  totalRaw: number;
  totalOptimized: number;
  totalSaved: number;
  savingsPercent: number;
  eventCount: number;
  sessions: number;
} {
  return getGlobalStatsForEvents(getAllEvents());
}
