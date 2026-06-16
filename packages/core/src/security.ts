/** Lines that must survive diff/log summarization */
const SECURITY_CRITICAL_RE =
  /password|secret|token|api[_-]?key|credential|vulnerability|CVE-\d|CRITICAL|SECURITY|PRIVATE KEY|BEGIN (RSA |EC |OPENSSH |DSA )?PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,}|gho_[a-zA-Z0-9]{20,}|github_pat_[a-zA-Z0-9_]{82}|glpat-[a-zA-Z0-9_-]{20}|sk-[a-zA-Z0-9]{20,}|eyJ[a-zA-Z0-9_-]*\.eyJ[a-zA-Z0-9_-]*\.[a-zA-Z0-9_-]*/i;

const NEVER_COMPRESS_CMD =
  /\b(cat|type|more|less)\s+[^\s|]*\.env\b|\b(cat|type)\s+.*\/\.env\b|secretsmanager|get-secret-value|vault\s+read|kubectl\s+get\s+secret|gpg\s+--decrypt|openssl\s+.*\b(key|pem)\b/i;

export function isSecurityCriticalLine(line: string): boolean {
  return SECURITY_CRITICAL_RE.test(line);
}

export function isSensitiveCommand(command: string): boolean {
  return NEVER_COMPRESS_CMD.test(command);
}

/** Output looks like a .env file (KEY=value lines) */
export function looksLikeEnvFile(output: string): boolean {
  const lines = output.split('\n').filter((l) => l.trim() && !l.trim().startsWith('#'));
  if (lines.length < 2) return false;
  const envLines = lines.filter((l) => /^[A-Z][A-Z0-9_]*\s*=/.test(l.trim())).length;
  return envLines >= 2 && envLines / lines.length >= 0.5;
}

export function looksLikeSecretMaterial(output: string): boolean {
  return (
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/.test(output) ||
    // AWS keys
    /AKIA[0-9A-Z]{16}/.test(output) ||
    // GitHub tokens (classic, fine-grained, oauth)
    /\bghp_[a-zA-Z0-9]{20,}\b/.test(output) ||
    /\bgho_[a-zA-Z0-9]{20,}\b/.test(output) ||
    /\bgithub_pat_[a-zA-Z0-9_]{82}\b/.test(output) ||
    // GitLab tokens
    /\bglpat-[a-zA-Z0-9_-]{20}\b/.test(output) ||
    // OpenAI / Anthropic API keys
    /\bsk-[a-zA-Z0-9]{20,}\b/.test(output) ||
    // JWT tokens (full format)
    /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}\b/.test(output) ||
    // Stripe keys
    /\b(sk|pk)_(test|live)_[a-zA-Z0-9]{24,}\b/.test(output) ||
    // SendGrid API keys
    /\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/.test(output) ||
    // Slack tokens
    /\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/.test(output) ||
    // Database connection strings
    /\bpostgresql:\/\/[^\s:@]+:[^\s@]+@/.test(output) ||
    /\bmongodb(\+srv)?:\/\/[^\s:@]+:[^\s@]+@/.test(output) ||
    /\bmysql:\/\/[^\s:@]+:[^\s@]+@/.test(output) ||
    // Firebase/Supabase URLs with keys
    /\b[a-zA-Z0-9-]+\.supabase\.co.*anon=[a-zA-Z0-9_-]{100,}/.test(output) ||
    /\bfirebaseio\.com.*[?&]auth=[a-zA-Z0-9_-]{20,}/.test(output)
  );
}

export function shouldCompress(command: string, output: string): boolean {
  if (isSensitiveCommand(command)) return false;
  if (looksLikeEnvFile(output)) return false;
  if (looksLikeSecretMaterial(output)) return false;
  return true;
}

export function redactSecrets(text: string): string {
  let out = text;

  // Private keys (all formats)
  out = out.replace(
    /-----BEGIN (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----/g,
    '[REDACTED_PRIVATE_KEY]'
  );

  // Bearer tokens
  out = out.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');

  // AWS keys
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA[REDACTED]');

  // GitHub tokens
  out = out.replace(/\bghp_[a-zA-Z0-9]{20,}\b/g, 'ghp_[REDACTED]');
  out = out.replace(/\bgho_[a-zA-Z0-9]{20,}\b/g, 'gho_[REDACTED]');
  out = out.replace(/\bgithub_pat_[a-zA-Z0-9_]{82}\b/g, 'github_pat_[REDACTED]');

  // GitLab tokens
  out = out.replace(/\bglpat-[a-zA-Z0-9_-]{20}\b/g, 'glpat-[REDACTED]');

  // OpenAI / Anthropic / AI service keys
  out = out.replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, 'sk-[REDACTED]');
  out = out.replace(/\bsk-proj-[a-zA-Z0-9]{20,}\b/g, 'sk-proj-[REDACTED]');

  // JWT tokens
  out = out.replace(
    /\beyJ[a-zA-Z0-9_-]{10,}\.eyJ[a-zA-Z0-9_-]{10,}\.[a-zA-Z0-9_-]{10,}/g,
    '[REDACTED_JWT]'
  );

  // Stripe keys
  out = out.replace(/\b(sk|pk)_(test|live)_[a-zA-Z0-9]{24,}\b/g, '$1_$2_[REDACTED]');

  // SendGrid API keys
  out = out.replace(/\bSG\.[a-zA-Z0-9_-]{22}\.[a-zA-Z0-9_-]{43}\b/g, 'SG.[REDACTED]');

  // Slack tokens
  out = out.replace(/\bxox[baprs]-[a-zA-Z0-9-]{10,}\b/g, 'xox[REDACTED]');

  // Generic API keys, passwords, secrets in key=value format
  out = out.replace(
    /(api[_-]?key|password|secret|token|credential)\s*[=:]\s*\S+/gi,
    '$1=[REDACTED]'
  );

  // Database connection strings
  out = out.replace(
    /\b(postgresql|postgres|mysql|mongodb(\+srv)?|redis):\/\/([^:\s@]+):([^@\s/]+)@/gi,
    (_match, scheme: string, _srv: string | undefined, user: string) =>
      `${scheme}://${user}:[REDACTED]@`
  );

  // Firebase/Supabase URLs with keys
  out = out.replace(/([a-zA-Z0-9-]+\.supabase\.co[^\s]*anon=)[a-zA-Z0-9_-]{100,}/g, '$1[REDACTED]');
  out = out.replace(/(firebaseio\.com[^\s]*[?&]auth=)[a-zA-Z0-9_-]{20,}/g, '$1[REDACTED]');

  return out;
}

/** Collapse diff +/- blocks but always keep security-critical lines */
export function collapseDiffBlock(
  block: string[],
  headKeep: number,
  kind: 'additions' | 'deletions'
): string[] {
  if (block.length === 0) return block;

  const critical = block.filter(isSecurityCriticalLine);
  const normal = block.filter((l) => !isSecurityCriticalLine(l));

  if (block.length <= headKeep + critical.length) {
    return block;
  }

  const keptNormal = normal.slice(0, headKeep);
  const omitted = block.length - keptNormal.length - critical.length;
  const result = [...keptNormal, ...critical];
  if (omitted > 0) {
    result.push(`[tokviz] … ${omitted} ${kind} omitted (${critical.length} security lines kept)`);
  }
  return result;
}
