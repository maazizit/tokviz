export { removeNoise, type NoiseMode } from './noiseRemoval.js';

/** Score a line based on its importance (higher = more important) */
export function scoreLineImportance(line: string): number {
  const _lower = line.toLowerCase();
  let score = 1; // Base score

  // Critical: errors and failures
  if (/\b(error|fatal|critical|fail|failed|exception|panic)\b/i.test(line)) {
    score += 100;
  }

  // High: warnings and important status
  if (/\b(warn|warning|alert|deprecated)\b/i.test(line)) {
    score += 50;
  }

  // Medium-high: security and credentials
  if (/\b(security|vulnerability|cve-\d|password|token|key|secret)\b/i.test(line)) {
    score += 40;
  }

  // Medium: test results and summaries
  if (/\b(summary|result|total|passed|skipped)\b/i.test(line)) {
    score += 30;
  }

  // Medium-low: file changes and diffs
  if (/^[\+\-]\s/.test(line) || /^(modified|new file|deleted):/.test(line)) {
    score += 20;
  }

  // Low: informational
  if (/\b(info|debug|trace)\b/i.test(line)) {
    score -= 10;
  }

  // Boost for lines with actual content (not just noise)
  if (line.trim().length > 40) {
    score += 5;
  }

  // Penalize very long lines (likely verbose output)
  if (line.length > 200) {
    score -= 10;
  }

  // Penalize empty or whitespace-only
  if (!line.trim()) {
    score = 0;
  }

  return Math.max(0, score);
}

/** Keep the most important lines based on scoring, preserving order */
export function selectImportantLines(text: string, maxLines: number): string {
  const lines = text.split('\n');

  if (lines.length <= maxLines) {
    return text;
  }

  // Score all lines
  const scored = lines.map((line, index) => ({
    line,
    score: scoreLineImportance(line),
    index,
  }));

  // Sort by score (descending), but preserve original order for kept lines
  const sorted = [...scored].sort((a, b) => b.score - a.score);
  const toKeep = sorted.slice(0, maxLines);

  // Restore original order
  toKeep.sort((a, b) => a.index - b.index);

  const kept = toKeep.map((item) => item.line);
  const omitted = lines.length - maxLines;

  if (omitted > 0) {
    kept.push(`[tokviz] … ${omitted} low-priority lines omitted`);
  }

  return kept.join('\n');
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

/** Detect and normalize lines with repetitive patterns (timestamps, counters, etc.) */
function normalizePattern(line: string): string {
  return (
    line
      // Normalize timestamps
      .replace(/\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(\.\d+)?Z?/g, '<TIMESTAMP>')
      // Normalize counters and numbers in specific patterns
      .replace(
        /\b(Processing|Installing|Downloading|Building|File|Package|Item)\s+\d+(\s+of\s+\d+)?/gi,
        '$1 <N>'
      )
      // Normalize file numbers
      .replace(/\b(file|package|item)[-_]?\d+\b/gi, '$1<N>')
      // Normalize progress indicators
      .replace(/\d+%/g, '<PCT>')
      // Normalize hashes (git short hashes, etc.)
      .replace(/\b[a-f0-9]{7,40}\b/g, '<HASH>')
      // Normalize durations
      .replace(/\d+(\.\d+)?(ms|s|m|h)\b/gi, '<TIME>')
  );
}

/** Smart deduplication that detects repetitive patterns */
export function dedupeLinesSmart(text: string, minRepeats: number): string {
  const lines = text.split('\n');
  const result: string[] = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const normalized = normalizePattern(line);

    // Count identical normalized patterns
    let count = 1;
    const samples: string[] = [line];

    while (i + count < lines.length) {
      const nextLine = lines[i + count];
      if (normalizePattern(nextLine) === normalized) {
        count++;
        // Keep a few samples
        if (samples.length < 2) {
          samples.push(nextLine);
        }
      } else {
        break;
      }
    }

    if (count >= minRepeats && line.trim() !== '') {
      // Show first sample and summary
      result.push(samples[0]);
      if (samples.length > 1 && count > 2) {
        result.push(samples[1]);
      }
      result.push(`[tokviz] … ${count - samples.length} similar lines (pattern detected)`);
    } else {
      for (let j = 0; j < count; j++) result.push(lines[i + j]);
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
