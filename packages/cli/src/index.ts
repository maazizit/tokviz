#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { runInit, type AgentName } from './commands/init.js';
import { runHook } from './commands/hook.js';
import { runStats } from './commands/stats.js';
import { runGain } from './commands/gain.js';
import { runDoctor } from './commands/doctor.js';
import { runUninstall } from './commands/uninstall.js';
import { runReport } from './commands/report.js';
import { runCompareCommand } from './commands/compare.js';
import { parseTrailingFlags } from './args.js';
import type { Agent } from '@tokviz/core';

function printHelp(): void {
  console.log(`
tokviz — Token tracker & shell compressor for AI agents

Usage:
  tokviz init -g --agent <cursor|copilot|gemini> [options]
  tokviz stats [--json] [--session <id>]
  tokviz gain
  tokviz report [options]
  tokviz compare [sessionA sessionB] [options]
  tokviz doctor
  tokviz hook                    # called by agent hooks (stdin JSON)
  tokviz uninstall -g --agent <cursor|copilot|gemini>

Init options:
  -g, --global          Install hooks globally (~/.cursor, ~/.copilot, ~/.gemini)
  --agent <name>        Target agent (default: cursor)
  --prose <lite|full|ultra|off>   Install prose compression skills (project scope)
  --enterprise          Metrics only, no command content logged
  --track-only          Track tokens, no shell compression

Report options:
  --format <md|html|json>   Output format (default: md)
  -o, --output <file>       Write report to file
  --since <7d|30d|date>    Filter start date
  --until <date>            Filter end date
  --agent <name>            Filter by agent
  --no-recommendations      Hide recommendations section

Compare options:
  <sessionA> <sessionB>     Compare two sessions by ID
  --agents <a,b>            Compare agents (e.g. cursor,copilot)
  --since <7d|30d|date>     Filter period
  --rank top                Rank most expensive sessions
  --limit <n>               Limit ranked results (default: 10)
  --baseline median         Compare session vs median (--session <id>)
  --before <date> --after <date>   Compare periods
  --json                    JSON output
  -o, --output <file>       Write output to file

Examples:
  tokviz init -g --agent cursor
  tokviz stats --json
  tokviz report --since 7d -o rapport.md
  tokviz compare sess-a sess-b
  tokviz compare --rank top --limit 5
  tokviz compare --agents cursor,copilot --since 30d
`);
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  const flags = parseTrailingFlags(rest);

  if (!cmd || cmd === '--help' || cmd === '-h') {
    printHelp();
    return;
  }

  switch (cmd) {
    case 'init': {
      const agent = (flags.agent as AgentName) ?? 'cursor';
      const { messages } = runInit({
        global: !!flags.global,
        agent,
        prose: flags.prose as 'lite' | 'full' | 'ultra' | 'off' | undefined,
        enterprise: !!flags.enterprise,
        trackOnly: !!flags.trackOnly,
      });
      messages.forEach((m) => console.log(m));
      break;
    }
    case 'stats':
      console.log(runStats({ json: !!flags.json, session: flags.session as string }));
      break;
    case 'gain':
      console.log(runGain());
      break;
    case 'report':
      console.log(
        runReport({
          format: (flags.format as 'md' | 'html' | 'json') ?? 'md',
          output: flags.output as string | undefined,
          since: flags.since as string | undefined,
          until: flags.until as string | undefined,
          agent: flags.agent as Agent | undefined,
          includeRecommendations: !flags.noRecommendations,
        })
      );
      break;
    case 'compare': {
      const positional = (flags.positional as string[] | undefined) ?? [];
      const sessions =
        positional.length >= 2
          ? positional.slice(0, 2)
          : flags.session
            ? [flags.session as string]
            : undefined;

      console.log(
        runCompareCommand({
          sessions,
          agents: flags.agents as string[] | undefined,
          since: flags.since as string | undefined,
          until: flags.until as string | undefined,
          agent: flags.agent as Agent | undefined,
          rank: flags.rank as 'top' | undefined,
          limit: flags.limit ? Number(flags.limit) : undefined,
          baseline: flags.baseline as 'median' | undefined,
          before: flags.before as string | undefined,
          after: flags.after as string | undefined,
          json: !!flags.json,
          markdown: !!flags.markdown,
          output: flags.output as string | undefined,
        })
      );
      break;
    }
    case 'doctor':
      console.log(runDoctor());
      break;
    case 'hook': {
      const stdin = readFileSync(0, 'utf8');
      const out = await runHook(stdin);
      process.stdout.write(out);
      break;
    }
    case 'uninstall': {
      const agent = (flags.agent as AgentName) ?? 'cursor';
      runUninstall({ global: !!flags.global, agent }).forEach((m) => console.log(m));
      break;
    }
    default:
      console.error(`Unknown command: ${cmd}`);
      printHelp();
      process.exit(1);
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
