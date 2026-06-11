export type NoiseMode = 'lite' | 'aggressive';

const ANSI_RE = /\x1b\[[0-9;?]*[ -/]*[@-~]/g;
const OSC_RE = /\x1b\][^\x07]*\x07/g;
const CARRIAGE_RE = /\r/g;
const PROGRESS_RE = /\[[#=>.\s-]{3,}\]\s*\d+%?/g;
const TIMESTAMP_RE =
  /(?:\d{4}-\d{2}-\d{2}[T ]\d{2}:\d{2}:\d{2}(?:\.\d+)?Z?|\b\w{3}\s+\d{1,2}\s+\d{2}:\d{2}:\d{2})\s*/g;
const LOG_LEVEL_RE = /^\[?(?:DEBUG|INFO|TRACE)\]?\s*:?\s*/gm;
const SPINNER_RE = /^[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+/gm;

const SEPARATOR_LINE_RE = /^[-=_*─═┈┉┊┋│┃╌╍╎╏═║]{3,}\s*$/;
const AGGRESSIVE_SPINNER_RE =
  /^(?:[⠋⠙⠹⠸⠼⠴⠦⠧⠇⠏]\s+|^[|/\\-]\s+\S{0,48}$|(?:Loading|Downloading|Installing|Building|Compiling|Resolving|Fetching)(?:\.{3,}|\s))/i;
const AGGRESSIVE_PROGRESS_RE = [
  /^[#.]+\s+\d{1,3}%/,
  /^\d{1,4}\/\d{1,4}(?:\s|$)/,
  /^(?:\s*\d+%\s*)?(?:\||\/|-|\\)\s*(?:\d+%|complete)/i,
  /^>\s*$/ ,
  /^\s*npm\s+WARN\s+deprecated/i,
];

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
  } else {
    out = out.replace(SPINNER_RE, '');
  }

  const lines = out
    .split('\n')
    .map(stripLineNoise)
    .filter((line) => !isNoiseLine(line, aggressive));

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

/** Strip universal shell noise: ANSI, timestamps, progress bars, log prefixes */
export function removeNoise(text: string, mode: NoiseMode = 'aggressive'): string {
  return applyNoiseRemoval(text, mode === 'aggressive');
}
