export { removeNoise, type NoiseMode } from './noiseRemoval.js';

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
