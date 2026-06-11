/** Lines that must survive diff/log summarization */
const SECURITY_CRITICAL_RE =
  /password|secret|token|api[_-]?key|credential|vulnerability|CVE-\d|CRITICAL|SECURITY|PRIVATE KEY|BEGIN (RSA |EC |OPENSSH )?PRIVATE KEY|AKIA[0-9A-Z]{16}|ghp_[a-zA-Z0-9]{20,}|sk-[a-zA-Z0-9]{20,}/i;

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
    /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/.test(output) ||
    /AKIA[0-9A-Z]{16}/.test(output) ||
    /\bghp_[a-zA-Z0-9]{20,}\b/.test(output) ||
    /\bsk-[a-zA-Z0-9]{20,}\b/.test(output) ||
    /\bpostgresql:\/\/[^\s:@]+:[^\s@]+@/.test(output) ||
    /\bmongodb(\+srv)?:\/\/[^\s:@]+:[^\s@]+@/.test(output)
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

  out = out.replace(/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----[\s\S]*?-----END (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/g, '[REDACTED_PRIVATE_KEY]');

  out = out.replace(/\bBearer\s+\S+/gi, 'Bearer [REDACTED]');
  out = out.replace(/\bAKIA[0-9A-Z]{16}\b/g, 'AKIA[REDACTED]');
  out = out.replace(/\bghp_[a-zA-Z0-9]{20,}\b/g, 'ghp_[REDACTED]');
  out = out.replace(/\bsk-[a-zA-Z0-9]{20,}\b/g, 'sk-[REDACTED]');
  out = out.replace(
    /(api[_-]?key|password|secret|token|credential)\s*[=:]\s*\S+/gi,
    '$1=[REDACTED]'
  );
  out = out.replace(
    /\b(postgresql|mysql|mongodb(\+srv)?|redis):\/\/([^:\s@]+):([^@\s/]+)@/gi,
    (_match, scheme: string, _srv: string | undefined, user: string) =>
      `${scheme}://${user}:[REDACTED]@`
  );

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
    result.push(
      `[tokviz] … ${omitted} ${kind} omitted (${critical.length} security lines kept)`
    );
  }
  return result;
}
