const VERBOSE_PATTERNS: Array<{ test: RegExp; tail: number }> = [
  { test: /\b(npm|pnpm|yarn|bun)\s+(install|ci)\b/, tail: 25 },
  { test: /\bdocker\s+(build|compose\s+(up|build))\b/, tail: 30 },
  { test: /\b(cargo|go)\s+(build|test)\b/, tail: 40 },
  { test: /\b(make|cmake\s+--build)\b/, tail: 35 },
  { test: /\b(mvn|gradle)\b/, tail: 35 },
  { test: /\b(tsc|webpack|vite\s+build|next\s+build)\b/, tail: 30 },
  { test: /\bterraform\s+(plan|apply|init)\b/, tail: 35 },
  { test: /\b(brew|apt-get|apk)\s+install\b/, tail: 20 },
  { test: /\bpip\s+install\b/, tail: 20 },
];

/** Wrap known verbose commands so the agent sees only the tail of output. */
export function wrapVerboseCommand(command: string): string | null {
  const trimmed = command.trim();
  if (!trimmed) return null;
  if (/\|\s*tail\b/.test(trimmed) || /\|\s*head\b/.test(trimmed)) return null;

  for (const { test, tail } of VERBOSE_PATTERNS) {
    if (test.test(trimmed)) {
      return `(${trimmed}) 2>&1 | tail -n ${tail}`;
    }
  }
  return null;
}
