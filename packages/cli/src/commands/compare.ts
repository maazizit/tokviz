import { writeFileSync } from 'node:fs';
import {
  formatCompareJson,
  formatCompareMarkdown,
  formatCompareTerminal,
  runCompare,
  type CompareOptions,
} from '@tokviz/core';

export interface CompareCommandOptions extends CompareOptions {
  json?: boolean;
  output?: string;
  markdown?: boolean;
}

export function runCompareCommand(opts: CompareCommandOptions): string {
  const result = runCompare(opts);

  let content: string;
  if (opts.json) {
    content = formatCompareJson(result);
  } else if (opts.markdown || opts.output?.endsWith('.md')) {
    content = formatCompareMarkdown(result);
  } else {
    content = formatCompareTerminal(result);
  }

  if (opts.output) {
    writeFileSync(opts.output, content, 'utf8');
    return `Compare written → ${opts.output}`;
  }

  return content;
}
