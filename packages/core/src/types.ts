export type Agent = 'cursor' | 'copilot' | 'gemini' | 'claude-code' | 'windsurf';

export type EventSource = 'shell' | 'prose' | 'tool' | 'subagent';

export interface TokenEvent {
  id: string;
  sessionId: string;
  agent: Agent;
  timestamp: string;
  source: EventSource;
  toolName?: string;
  command?: string;
  tokensRaw: number;
  tokensOptimized: number;
  tokensSaved: number;
  metadata?: Record<string, unknown>;
}

export interface SessionStats {
  sessionId: string;
  agent: string;
  startedAt: string;
  tokensIn: number;
  tokensOut: number;
  tokensSaved: number;
  savingsPercent: number;
  byTool: Record<string, { in: number; out: number; saved: number }>;
  bySource: Record<string, number>;
  timeline: { ts: string; cumulativeSaved: number }[];
}

export interface TokVizConfig {
  enterpriseMode: boolean;
  noContentLog: boolean;
  trackOnly: boolean;
  retentionDays: number;
}

export const DEFAULT_CONFIG: TokVizConfig = {
  enterpriseMode: false,
  noContentLog: false,
  trackOnly: false,
  retentionDays: 90,
};
