export type NoiseMode = 'lite' | 'aggressive';

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const OSC_RE = /\x1b\][^\x07]*\x07/g;
const CARRIAGE_RE = /\r/g;
const PROGRESS_RE = /\[[#=>.\s-]{3,}\]\s*\d+%?/g;
const TIMESTAMP_RE =
  /(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?|\b\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s*/g;
const LOG_LEVEL_RE = /^\[?(?:DEBUG|INFO|TRACE)\]?\s*:?\s*/gm;
const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+/gm;

// New patterns for aggressive mode
const URL_RE = /https?:\/\/[^\s]+/g;
const GIT_HASH_RE = /\b([a-f0-9]{40})\b/g;
const _GIT_SHORT_HASH_RE = /\b([a-f0-9]{7,12})\b/g;
const UUID_RE = /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi;

const SEPARATOR_LINE_RE = /^[-=_*─═┈┉┊┋│┃╌╍╎╏═║]{3,}\s*$/;
const AGGRESSIVE_SPINNER_RE =
  /^(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+|^[|/\\-]\s+\S{0,48}$|(?:Loading|Downloading|Installing|Building|Compiling|Resolving|Fetching)(?:\.{3,}|\s))/i;
const AGGRESSIVE_PROGRESS_RE = [
  /^[#.]+\s+\d{1,3}%/,
  /^\d{1,4}\/\d{1,4}(?:\s|$)/,
  /^(?:\s*\d+%\s*)?(?:\||\/|-|\\)\s*(?:\d+%|complete)/i,
  /^>\s*$/,
  /^\s*npm\s+WARN\s+deprecated/i,
];

function shortenUrl(url: string): string {
  try {
    const parsed = new URL(url);
    return `${parsed.hostname}${parsed.pathname.length > 20 ? '/...' : parsed.pathname}`;
  } catch {
    return url.slice(0, 40) + '...';
  }
}

function shortenHash(hash: string): string {
  return hash.slice(0, 7);
}

function applyAggressiveNormalization(text: string): string {
  let out = text;

  // Shorten URLs to just domain + short path
  out = out.replace(URL_RE, (url) => `<${shortenUrl(url)}>`);

  // Shorten full Git hashes to 7 chars
  out = out.replace(GIT_HASH_RE, (hash) => shortenHash(hash));

  // Replace UUIDs with placeholder
  out = out.replace(UUID_RE, '<UUID>');

  return out;
}

function stripLineNoise(line: string): string {
  return line.replace(TIMESTAMP_RE, '').replace(LOG_LEVEL_RE, '').trimEnd();
}

function isNoiseLine(line: string, aggressive: boolean): boolean {
  const t = line.trim();
  if (!t) return false;
  if (aggressive && SEPARATOR_LINE_RE.test(t)) return true;
  if (!aggressive) return false;
  if (AGGRESSIVE_SPINNER_RE.test(t)) return true;
  return AGGRESSIVE_PROGRESS_RE.some((re) => re.test(t));
}

function applyNoiseRemoval(text: string, aggressive: boolean): string {
  let out = text
    .replace(OSC_RE, '')
    .replace(ANSI_RE, '')
    .replace(CARRIAGE_RE, '')
    .replace(PROGRESS_RE, '');

  if (aggressive) {
    out = out.replace(SPINNER_RE, '');
    out = applyAggressiveNormalization(out);
  } else {
    out = out.replace(SPINNER_RE, '');
  }

  const lines = out
    .split('\n')
    .map(stripLineNoise)
    .filter((line) => !isNoiseLine(line, aggressive));

  return lines
    .join('\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

/** Strip universal shell noise: ANSI, timestamps, progress bars, log prefixes */
export function removeNoise(text: string, mode: NoiseMode = 'aggressive'): string {
  return applyNoiseRemoval(text, mode === 'aggressive');
}
