const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const OSC_RE = /\x1b\][^\x07]*\x07/g;
const CARRIAGE_RE = /\r/g;
const PROGRESS_RE = /\[[#=>.\s-]{3,}\]\s*\d+%?/g;
const TIMESTAMP_RE =
  /(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?|\b\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s*/g;
const LOG_LEVEL_RE = /^\[?(?:DEBUG|INFO|WARN|WARNING|ERROR|TRACE)\]?\s*:?\s*/gm;
const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+/gm;

/** Strip universal shell noise: ANSI, timestamps, progress bars, log prefixes */
export function removeNoise(text: string): string {
  return text
    .replace(OSC_RE, '')
    .replace(ANSI_RE, '')
    .replace(CARRIAGE_RE, '')
    .replace(PROGRESS_RE, '')
    .replace(SPINNER_RE, '')
    .split('\n')
    .map((line) => line.replace(TIMESTAMP_RE, '').replace(LOG_LEVEL_RE, '').trimEnd())
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Collapse runs of identical lines when count >= minRepeats */
export function dedupeLines(text: string, minRepeats: number): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    let count = 1;
    while (i + count < lines.length && lines[i + count] === line) {
      count++;
    }

    if (count >= minRepeats && line.trim() !== '') {
      result.push(line);
      result.push(`[tokviz] … ${count - 1} duplicate lines omitted`);
    } else {
      for (let j = 0; j < count; j++) result.push(line);
    }
    i += count;
  }

  return result.join('\n');
}

export function truncateLines(text: string, max: number): string {
  const lines = text.split('\n');
  if (lines.length <= max) return text;
  const kept = lines.slice(0, max);
  kept.push(`[tokviz] … ${lines.length - max} lines truncated`);
  return kept.join('\n');
}
