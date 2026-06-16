import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { compressShellOutput } from './compressor/shell.js';
import {
  collapseDiffBlock,
  isSecurityCriticalLine,
  looksLikeEnvFile,
  redactSecrets,
  shouldCompress,
} from './security.js';
import { smartCompress } from './compressors.js';

describe('redactSecrets', () => {
  it('redacts api keys and bearer tokens', () => {
    const out = redactSecrets('api_key=supersecret123\nAuthorization: Bearer eyJ.xxx');
    assert.match(out, /api_key=\[REDACTED\]/);
    assert.doesNotMatch(out, /supersecret123/);
    assert.match(out, /Bearer \[REDACTED\]/);
  });

  it('redacts AWS and GitHub tokens', () => {
    const out = redactSecrets('aws=AKIAIOSFODNN7EXAMPLE\nghp_abcdefghijklmnopqrstuvwxyz123456');
    assert.match(out, /AKIA\[REDACTED\]/);
    assert.match(out, /ghp_\[REDACTED\]/);
    assert.doesNotMatch(out, /EXAMPLE/);
  });

  it('redacts database URLs with credentials', () => {
    const out = redactSecrets('postgresql://admin:s3cr3t@db.example.com:5432/app');
    assert.match(out, /\[REDACTED\]@db\.example\.com/);
    assert.doesNotMatch(out, /s3cr3t/);
  });

  it('redacts PEM private keys', () => {
    const pem = '-----BEGIN RSA PRIVATE KEY-----\nMIIEowIBAAKCAQEA\n-----END RSA PRIVATE KEY-----';
    const out = redactSecrets(pem);
    assert.match(out, /\[REDACTED_PRIVATE_KEY\]/);
    assert.doesNotMatch(out, /MIIEow/);
  });
});

describe('shouldCompress', () => {
  it('blocks cat .env commands', () => {
    assert.equal(shouldCompress('cat .env', 'DB_HOST=localhost'), false);
    assert.equal(shouldCompress('cat config/.env', 'API_KEY=x'), false);
  });

  it('blocks kubectl get secret', () => {
    assert.equal(shouldCompress('kubectl get secret db-creds -o yaml', 'data:'), false);
  });

  it('blocks env-file shaped output', () => {
    const env = ['DB_HOST=localhost', 'API_KEY=abc', 'SECRET_TOKEN=xyz'].join('\n');
    assert.equal(shouldCompress('echo ok', env), false);
  });

  it('allows normal git diff', () => {
    assert.equal(shouldCompress('git diff', 'diff --git a/x.ts b/x.ts\n+const x = 1'), true);
  });
});

describe('collapseDiffBlock', () => {
  it('keeps security-critical lines when collapsing', () => {
    const block = [
      '-const a = 1;',
      '-const b = 2;',
      '-const c = 3;',
      '-const password = "leak";',
      '-const d = 4;',
      '-const e = 5;',
    ];
    const out = collapseDiffBlock(block, 2, 'deletions');
    assert.ok(out.some((l) => l.includes('password')));
    assert.match(out.join('\n'), /omitted/);
    assert.ok(!out.some((l) => l.includes('const e')));
  });
});

describe('security pipeline', () => {
  it('does not compress cat .env output', () => {
    const raw = 'API_KEY=secret123\nDB_PASSWORD=hunter2\nJWT_SECRET=abc';
    const result = compressShellOutput('cat .env', raw);
    assert.equal(result.compressed, false);
    assert.doesNotMatch(result.output, /hunter2/);
    assert.match(result.output, /\[REDACTED\]/);
  });

  it('redacts secrets in git diff additions', () => {
    const raw = [
      'diff --git a/config.ts b/config.ts',
      '@@ -1 +1,2 @@',
      '+const api_key = "sk-abcdefghijklmnopqrstuvwxyz12";',
      '+export const x = 1;',
    ].join('\n');
    const _out = smartCompress('git diff', raw);
    const result = compressShellOutput('git diff', raw);
    assert.doesNotMatch(result.output, /sk-abcdefghijklmnopqrstuvwxyz12/);
    assert.match(result.output, /\[REDACTED\]|sk-\[REDACTED\]/);
  });

  it('preserves CVE lines in large diff collapse', () => {
    const deletions = Array.from({ length: 10 }, (_, i) => `-line ${i}`).concat(
      '-CVE-2024-1234 critical vulnerability in auth'
    );
    const raw = ['diff --git a/x.ts b/x.ts', '@@ -1,12 +1,1 @@', ...deletions].join('\n');
    const out = compressShellOutput('git diff', raw);
    assert.ok(out.output.includes('CVE-2024-1234'));
  });
});

describe('isSecurityCriticalLine', () => {
  it('flags password and CVE patterns', () => {
    assert.equal(isSecurityCriticalLine('+const password = "x";'), true);
    assert.equal(isSecurityCriticalLine('CVE-2024-9999 in dependency'), true);
    assert.equal(isSecurityCriticalLine('+const count = 1;'), false);
  });
});

describe('looksLikeEnvFile', () => {
  it('detects KEY=value files', () => {
    assert.equal(looksLikeEnvFile('FOO=1\nBAR=2\n# comment'), true);
    assert.equal(looksLikeEnvFile('hello world\nfoo bar'), false);
  });
});
