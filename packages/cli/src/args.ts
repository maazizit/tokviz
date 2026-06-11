export function nextValue(argv: string[], index: number): string | undefined {
  const value = argv[index + 1];
  if (!value || value.startsWith('-')) return undefined;
  return value;
}

export function parseTrailingFlags(argv: string[]): Record<string, string | boolean | string[]> {
  const out: Record<string, string | boolean | string[]> = {};
  const positional: string[] = [];

  for (let i = 0; i < argv.length; i++) {
    const arg = argv[i];

    if (arg === '--json') out.json = true;
    else if (arg === '--live') out.live = true;
    else if (arg === '--repo') out.repo = nextValue(argv, i++) ?? '';
    else if (arg === '--target') out.target = nextValue(argv, i++) ?? '60';
    else if (arg === '--no-recommendations') out.noRecommendations = true;
    else if (arg === '--global' || arg === '-g') out.global = true;
    else if (arg === '--enterprise') out.enterprise = true;
    else if (arg === '--track-only') out.trackOnly = true;
    else if (arg === '--markdown') out.markdown = true;
    else if (arg === '--format') out.format = nextValue(argv, i++) ?? 'md';
    else if (arg === '-o' || arg === '--output') out.output = nextValue(argv, i++) ?? '';
    else if (arg === '--since') out.since = nextValue(argv, i++) ?? '';
    else if (arg === '--until') out.until = nextValue(argv, i++) ?? '';
    else if (arg === '--agent') out.agent = nextValue(argv, i++) ?? '';
    else if (arg === '--agents') out.agents = (nextValue(argv, i++) ?? '').split(',').filter(Boolean);
    else if (arg === '--session') out.session = nextValue(argv, i++) ?? '';
    else if (arg === '--rank') out.rank = nextValue(argv, i++) ?? 'top';
    else if (arg === '--limit') out.limit = nextValue(argv, i++) ?? '10';
    else if (arg === '--baseline') out.baseline = nextValue(argv, i++) ?? 'median';
    else if (arg === '--before') out.before = nextValue(argv, i++) ?? '';
    else if (arg === '--after') out.after = nextValue(argv, i++) ?? '';
    else if (arg === '--prose') out.prose = nextValue(argv, i++) ?? '';
    else if (!arg.startsWith('-')) positional.push(arg);
  }

  if (positional.length > 0) {
    out.positional = positional;
  }

  return out;
}
