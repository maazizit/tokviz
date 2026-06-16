import { describe, it, beforeEach, afterEach } from 'node:test';
import assert from 'node:assert/strict';
import { mkdirSync, rmSync, writeFileSync, mkdtempSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { buildReport } from './report.js';
import { runCompare } from './compare.js';
import { buildRecommendations } from './recommendations.js';
import { getSessionStatsForEvents } from './db.js';
import type { TokenEvent } from './types.js';

const TEST_HOME = mkdtempSync(join(tmpdir(), 'tokviz-test-'));
const EVENTS_FILE = join(TEST_HOME, 'events.json');
process.env.TOKVIZ_HOME = TEST_HOME;

const sampleEvents: TokenEvent[] = [
  {
    id: '1',
    sessionId: 'sess-a',
    agent: 'cursor',
    timestamp: '2026-06-05T10:00:00.000Z',
    source: 'shell',
    toolName: 'Shell',
    command: 'git diff',
    tokensRaw: 10_000,
    tokensOptimized: 2_000,
    tokensSaved: 8_000,
  },
  {
    id: '2',
    sessionId: 'sess-a',
    agent: 'cursor',
    timestamp: '2026-06-05T10:05:00.000Z',
    source: 'prose',
    tokensRaw: 500,
    tokensOptimized: 500,
    tokensSaved: 0,
  },
  {
    id: '3',
    sessionId: 'sess-b',
    agent: 'copilot',
    timestamp: '2026-06-05T11:00:00.000Z',
    source: 'shell',
    toolName: 'Shell',
    command: 'pytest tests',
    tokensRaw: 8_000,
    tokensOptimized: 7_500,
    tokensSaved: 500,
  },
];

describe('analytics', () => {
  beforeEach(() => {
    mkdirSync(TEST_HOME, { recursive: true });
    writeFileSync(EVENTS_FILE, JSON.stringify({ events: sampleEvents }), 'utf8');
  });

  afterEach(() => {
    rmSync(TEST_HOME, { recursive: true, force: true });
  });

  it('builds report with recommendations', () => {
    const report = buildReport();
    assert.equal(report.global.eventCount, 3);
    assert.equal(report.global.sessions, 2);
    assert.ok(report.recommendations.length > 0);
    assert.equal(report.byAgent.length, 2);
  });

  it('filters report by agent', () => {
    const report = buildReport({ agent: 'cursor' });
    assert.equal(report.global.sessions, 1);
    assert.equal(report.global.eventCount, 2);
  });

  it('compares two sessions', () => {
    const result = runCompare({ sessions: ['sess-a', 'sess-b'] });
    assert.equal(result.mode, 'sessions');
    assert.equal(result.rows.length, 2);
    assert.ok(result.delta);
    assert.equal(result.rows[0].sessionId, 'sess-a');
  });

  it('ranks expensive sessions by cost score', () => {
    const result = runCompare({ rank: 'top', limit: 2 });
    assert.equal(result.mode, 'rank');
    // sess-b: 8000 IN × 93.75% non-saved = 7500 > sess-a: 10500 × 20% = 2100
    assert.equal(result.rows[0].sessionId, 'sess-b');
  });

  it('warns when a session has low savings on high volume', () => {
    const sessions = getSessionStatsForEvents(sampleEvents);
    const recs = buildRecommendations(sessions, sampleEvents);
    assert.ok(
      recs.some((rec) => rec.message.includes('économie faible') || rec.message.includes('15 %'))
    );
  });
});
