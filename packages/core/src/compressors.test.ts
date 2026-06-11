import assert from 'node:assert/strict';
import { describe, it } from 'node:test';
import { detectCommandType, smartCompress } from './compressors.js';
import { estimateTokens } from './tokens.js';

function savingsPercent(raw: string, compressed: string): number {
  const tokensRaw = estimateTokens(raw);
  const tokensOut = estimateTokens(compressed);
  if (tokensRaw === 0) return 0;
  return Math.round(((tokensRaw - tokensOut) / tokensRaw) * 100);
}

describe('detectCommandType', () => {
  it('matches git diff with extra flags', () => {
    assert.equal(detectCommandType('git diff HEAD~1'), 'git diff');
  });

  it('matches cargo test verbose', () => {
    assert.equal(detectCommandType('cargo test --verbose'), 'cargo test');
  });

  it('matches pnpm test', () => {
    assert.equal(detectCommandType('pnpm test --filter core'), 'pnpm test');
  });

  it('matches pytest', () => {
    assert.equal(detectCommandType('python -m pytest tests/'), 'pytest');
  });

  it('matches rg before grep substring', () => {
    assert.equal(detectCommandType('rg "foo" src/'), 'rg');
  });

  it('returns generic for unknown commands', () => {
    assert.equal(detectCommandType('echo hello'), 'generic');
  });

  it('matches kubectl describe', () => {
    assert.equal(detectCommandType('kubectl describe pod api-1'), 'kubectl');
  });

  it('matches aws cli', () => {
    assert.equal(detectCommandType('aws s3 ls s3://bucket'), 'aws');
  });

  it('matches gcloud', () => {
    assert.equal(detectCommandType('gcloud compute instances list'), 'gcp');
  });

  it('matches curl without matching catch', () => {
    assert.equal(detectCommandType('curl -s https://api.example.com'), 'curl');
    assert.equal(detectCommandType('node catch.js'), 'generic');
  });

  it('matches cat with word boundary', () => {
    assert.equal(detectCommandType('cat package.json'), 'cat');
    assert.equal(detectCommandType('node catch.js'), 'generic');
  });
});

describe('smartCompress', () => {
  it('collapses large unified diff deletion blocks', () => {
    const deletions = Array.from({ length: 20 }, (_, i) => `-removed line ${i}`).join('\n');
    const raw = ['diff --git a/x.ts b/x.ts', '@@ -1,5 +1,1 @@', deletions, '+added'].join(
      '\n'
    );

    const out = smartCompress('git diff', raw);
    assert.match(out, /deletions omitted/);
    assert.ok(!out.includes('removed line 19'));
  });

  it('compresses custom git diff format', () => {
    const raw = [
      'packages/foo.ts | 2 +',
      '--- Changes ---',
      'packages/foo.ts',
      '  @@ -1,2 +1,3 @@',
      ' context',
      ' +added',
      ' -removed',
      '+1 -1',
    ].join('\n');

    const out = smartCompress('git diff', raw);
    assert.ok(out.includes('@@'));
    assert.ok(out.includes('+added'));
    assert.ok(out.includes('-removed'));
    assert.ok(!out.includes('context'));
    assert.ok(!out.includes('packages/foo.ts'));
    assert.ok(!out.includes('| 2 +'));
  });

  it('summarizes git status with many tracked files', () => {
    const raw = [
      'On branch main',
      '  (use "git add ..." to update what will be committed)',
      '\tmodified:   a.ts',
      '\tmodified:   b.ts',
      '\tmodified:   c.ts',
      '\tmodified:   d.ts',
      '?? u1',
      '?? u2',
      '?? u3',
      '?? u4',
    ].join('\n');

    const out = smartCompress('git status', raw);
    assert.ok(!out.includes('git add'));
    assert.match(out, /more tracked files/);
    assert.match(out, /Untracked:.*4 files/);
  });

  it('filters git diff to change lines only', () => {
    const raw = [
      'diff --git a/foo.ts b/foo.ts',
      'index abc..def 100644',
      '--- a/foo.ts',
      '+++ b/foo.ts',
      '@@ -1,3 +1,3 @@',
      ' context line',
      '-old line',
      '+new line',
    ].join('\n');

    const out = smartCompress('git diff', raw);
    assert.ok(out.includes('@@'));
    assert.ok(out.includes('-old line'));
    assert.ok(out.includes('+new line'));
    assert.ok(!out.includes('context line'));
    assert.ok(!out.includes('diff --git'));
  });

  it('keeps only test summary when all pass', () => {
    const raw = [
      'test foo ... ok',
      'test bar ... ok',
      'test baz ... ok',
      'test result: ok. 3 passed; 0 failed',
    ].join('\n');

    const out = smartCompress('cargo test', raw);
    assert.equal(out, 'test result: ok. 3 passed; 0 failed');
    assert.ok(!out.includes('test foo'));
  });

  it('keeps npm test failures and summary', () => {
    const raw = [
      'PASS src/a.test.ts',
      'FAIL src/b.test.ts',
      '  ● suite › fails',
      '    Error: boom',
      'Test Suites: 1 failed, 1 passed, 2 total',
      'Tests: 1 failed, 3 passed, 4 total',
    ].join('\n');

    const out = smartCompress('npm test', raw);
    assert.ok(out.includes('FAIL'));
    assert.ok(out.includes('Error: boom'));
    assert.ok(!out.includes('PASS src/a'));
    assert.ok(!out.includes('Tests:'));
  });

  it('groups rg matches by file', () => {
    const raw = [
      'src/a.ts:10:smartCompress(cmd)',
      'src/a.ts:20:smartCompress(other)',
      'src/a.ts:30:smartCompress(x)',
      'src/b.ts:5:detectCommandType(cmd)',
      'src/b.ts:8:detectCommandType(y)',
      'src/b.ts:12:detectCommandType(z)',
    ].join('\n');

    const out = smartCompress('rg smartCompress', raw);
    assert.match(out, /src\/a\.ts: \(3 matches\)/);
    assert.ok(!out.includes('src/a.ts:30'));
  });

  it('drops INFO docker logs and keeps ERROR/WARN only', () => {
    const raw = [
      '2026-06-11T14:32:00.123Z INFO: Server started',
      '2026-06-11T14:33:00.000Z ERROR: database connection failed',
      '2026-06-11T14:33:01.000Z WARN: retrying connection',
    ].join('\n');
    const out = smartCompress('docker logs mycontainer', raw);
    assert.match(out, /ERROR: database connection failed/);
    assert.match(out, /WARN: retrying connection/);
    assert.ok(!out.includes('Server started'));
  });

  it('truncates long cat output with head/tail summary', () => {
    const raw = Array.from({ length: 120 }, (_, i) => `line ${i}`).join('\n');
    const out = smartCompress('cat big.log', raw);
    assert.match(out, /lines omitted/);
    assert.ok(out.includes('line 0'));
    assert.ok(out.includes('line 119'));
    assert.ok(!out.includes('line 50'));
  });

  it('summarizes kubectl table output', () => {
    const header = 'NAME   READY   STATUS';
    const rows = Array.from({ length: 20 }, (_, i) => `pod-${i}   1/1   Running`);
    const raw = [header, ...rows].join('\n');
    const out = smartCompress('kubectl get pods', raw);
    assert.match(out, /more rows/);
    assert.ok(out.includes('pod-0'));
    assert.ok(!out.includes('pod-19'));
  });

  it('summarizes aws json list output', () => {
    const items = Array.from({ length: 30 }, (_, i) => ({
      InstanceId: `i-${i}`,
      State: 'running',
    }));
    const raw = JSON.stringify(items);
    const out = smartCompress('aws ec2 describe-instances', raw);
    assert.match(out, /30 items/);
    assert.ok(!raw.includes('i-29') || !out.includes('i-29'));
  });

  it('compresses curl http response body', () => {
    const raw = [
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      '',
      'x'.repeat(800),
    ].join('\n');
    const out = smartCompress('curl -s https://api.example.com', raw);
    assert.match(out, /body chars omitted/);
  });

  it('aggressively groups grep matches', () => {
    const raw = Array.from({ length: 10 }, (_, i) => `src/a.ts:${i}:match`).join('\n');
    const out = smartCompress('grep match src/', raw);
    assert.match(out, /10 matches/);
    assert.ok(!out.includes('src/a.ts:9'));
  });

  it('fail-safe returns raw when filter would empty output', () => {
    const raw = Array.from({ length: 50 }, (_, i) => `plain ${i}`).join('\n');
    const out = smartCompress('git diff', raw);
    assert.equal(out, raw);
  });
});

describe('compression ratio', () => {
  it('achieves >=90% on verbose cargo test when all pass', () => {
    const passed = Array.from({ length: 40 }, (_, i) => `test case_${i} ... ok`).join('\n');
    const raw = `${passed}\ntest result: ok. 40 passed; 0 failed`;

    const out = smartCompress('cargo test', raw);
    assert.ok(savingsPercent(raw, out) >= 90);
  });

  it('achieves >=90% on INFO-only docker logs', () => {
    const line = '2026-06-11T14:32:00.123Z INFO: request handled';
    const raw = Array.from({ length: 30 }, () => line).join('\n');

    const out = smartCompress('docker logs api', raw);
    assert.ok(savingsPercent(raw, out) >= 90);
  });

  it('achieves >=70% on noisy git diff with only +/- @@ kept', () => {
    const context = Array.from({ length: 80 }, (_, i) => ` unchanged line ${i}`).join('\n');
    const raw = [
      'diff --git a/x.ts b/x.ts',
      'index aaa..bbb 100644',
      '--- a/x.ts',
      '+++ b/x.ts',
      '@@ -1,5 +1,5 @@',
      context,
      '-removed',
      '+added',
    ].join('\n');

    const out = smartCompress('git diff', raw);
    assert.ok(savingsPercent(raw, out) >= 70);
    assert.ok(!out.includes('diff --git'));
  });

  it('achieves 65-70% effective compression on typical shell mix', () => {
    const scenarios: Array<{ cmd: string; raw: string }> = [
      {
        cmd: 'git diff',
        raw: [
          'diff --git a/x.ts b/x.ts',
          'index aaa..bbb 100644',
          '--- a/x.ts',
          '+++ b/x.ts',
          '@@ -1,40 +1,40 @@',
          ...Array.from({ length: 35 }, (_, i) => ` context ${i}`),
          '-old',
          '+new',
        ].join('\n'),
      },
      {
        cmd: 'cargo test',
        raw: [
          ...Array.from({ length: 25 }, (_, i) => `test case_${i} ... ok`),
          'test result: ok. 25 passed; 0 failed',
        ].join('\n'),
      },
      {
        cmd: 'docker logs api',
        raw: Array.from({ length: 20 }, () => '2026-06-11T14:32:00.123Z INFO: handled').join(
          '\n'
        ),
      },
      {
        cmd: 'npm test',
        raw: [
          'PASS src/a.test.ts',
          'PASS src/b.test.ts',
          'Test Suites: 2 passed, 2 total',
          'Tests: 6 passed, 6 total',
        ].join('\n'),
      },
      {
        cmd: 'kubectl get pods',
        raw: [
          'NAME   READY   STATUS',
          ...Array.from({ length: 25 }, (_, i) => `pod-${i}   1/1   Running`),
        ].join('\n'),
      },
    ];

    let rawTotal = 0;
    let savedTotal = 0;
    let active = 0;

    for (const { cmd, raw } of scenarios) {
      const out = smartCompress(cmd, raw);
      const rawTokens = estimateTokens(raw);
      const outTokens = estimateTokens(out);
      rawTotal += rawTokens;
      savedTotal += Math.max(0, rawTokens - outTokens);
      if (out !== raw && outTokens < rawTokens) active++;
    }

    const effective = rawTotal > 0 ? Math.round((savedTotal / rawTotal) * 100) : 0;
    assert.ok(active >= 4);
    assert.ok(effective >= 65, `effective=${effective}% (target 65-70%+)`);
  });

  it('achieves >=70% on kubectl get pods table', () => {
    const header = 'NAME   READY   STATUS   RESTARTS   AGE';
    const rows = Array.from(
      { length: 40 },
      (_, i) => `pod-worker-${i}-abc1234567-xyz   1/1   Running   0   ${i}d`
    );
    const raw = [header, ...rows].join('\n');
    const out = smartCompress('kubectl get pods', raw);
    assert.ok(savingsPercent(raw, out) >= 70);
  });

  it('achieves >=80% on aws json output', () => {
    const items = Array.from({ length: 50 }, (_, i) => ({
      InstanceId: `i-0${i.toString().padStart(8, '0')}`,
      InstanceType: 't3.medium',
      State: { Name: 'running' },
      Tags: [{ Key: 'Name', Value: `worker-${i}` }],
    }));
    const raw = JSON.stringify(items);
    const out = smartCompress('aws ec2 describe-instances --output json', raw);
    assert.ok(savingsPercent(raw, out) >= 80);
  });

  it('achieves >=60% on gcloud table output', () => {
    const header = 'NAME   ZONE   MACHINE_TYPE   STATUS';
    const rows = Array.from(
      { length: 35 },
      (_, i) => `vm-${i}   us-central1-a   n1-standard-1   RUNNING`
    );
    const raw = [header, ...rows].join('\n');
    const out = smartCompress('gcloud compute instances list', raw);
    assert.ok(savingsPercent(raw, out) >= 60);
  });

  it('achieves >=65% on docker ps output', () => {
    const header = 'CONTAINER ID   IMAGE   COMMAND   CREATED   STATUS   PORTS   NAMES';
    const rows = Array.from(
      { length: 30 },
      (_, i) => `abc${i.toString().padStart(9, '0')}   nginx   "/docker-entrypoint"   2 days ago   Up 2 days   80/tcp   web-${i}`
    );
    const raw = [header, ...rows].join('\n');
    const out = smartCompress('docker ps', raw);
    assert.ok(savingsPercent(raw, out) >= 65);
  });

  it('achieves >=85% on grep output', () => {
    const raw = Array.from({ length: 40 }, (_, i) => `src/lib.ts:${i}:export function foo${i}()`).join(
      '\n'
    );
    const out = smartCompress('grep foo src/', raw);
    assert.ok(savingsPercent(raw, out) >= 85);
  });

  it('achieves >=70% on curl verbose output', () => {
    const raw = [
      '  % Total    % Received % Xferd  Average Speed   Time    Time     Time  Current',
      '                                 Dload  Upload   Total   Spent    Left  Speed',
      '  0     0    0     0    0     0      0      0 --:--:-- --:--:-- --:--:--     0',
      'HTTP/1.1 200 OK',
      'Content-Type: application/json',
      'Content-Length: 5000',
      '',
      'x'.repeat(5000),
    ].join('\n');
    const out = smartCompress('curl -v https://api.example.com/data', raw);
    assert.ok(savingsPercent(raw, out) >= 70);
  });

  it('achieves >=75% on long cat output', () => {
    const raw = Array.from({ length: 200 }, (_, i) => `export const item${i} = ${i};`).join('\n');
    const out = smartCompress('cat src/items.ts', raw);
    assert.ok(savingsPercent(raw, out) >= 75);
  });
});
