import { writeFileSync } from 'node:fs';
import {
  buildReport,
  formatReportHtml,
  formatReportJson,
  formatReportMarkdown,
  type ReportOptions,
} from '@tokviz/core';

export interface ReportCommandOptions extends ReportOptions {
  format?: 'md' | 'html' | 'json';
  output?: string;
}

export function runReport(opts: ReportCommandOptions): string {
  const data = buildReport(opts);

  let content: string;
  switch (opts.format ?? 'md') {
    case 'html':
      content = formatReportHtml(data);
      break;
    case 'json':
      content = formatReportJson(data);
      break;
    default:
      content = formatReportMarkdown(data);
  }

  if (opts.output) {
    writeFileSync(opts.output, content, 'utf8');
    return `Report written → ${opts.output}`;
  }

  return content;
}
