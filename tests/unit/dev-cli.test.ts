import { test } from 'node:test';
import assert from 'node:assert/strict';
import { mkdtemp, mkdir, copyFile, writeFile, readFile, chmod, rm, stat } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync, type SpawnSyncReturns } from 'node:child_process';

// Docker é substituído por um executável controlado: nenhum teste toca no banco real.
async function fixture(
  run: (f: {
    root: string;
    exec: (args: string[], env?: NodeJS.ProcessEnv) => SpawnSyncReturns<string>;
    calls: () => Promise<string[][]>;
  }) => Promise<void>
) {
  const temp = await mkdtemp(path.join(tmpdir(), 'flora-dev-cli-'));
  const root = path.join(temp, 'checkout with spaces');
  const bin = path.join(temp, 'bin');
  const log = path.join(temp, 'docker.log');
  await mkdir(root);
  await mkdir(bin);
  await mkdir(path.join(root, 'scripts'));
  await copyFile(
    fileURLToPath(new URL('../../dev.sh', import.meta.url)),
    path.join(root, 'dev.sh')
  );
  await writeFile(path.join(root, '.env.local'), 'PRIVATE_SENTINEL=preserve-me\n');
  await writeFile(
    path.join(root, '.env.example'),
    'BETTER_AUTH_SECRET=replace-me\nADMIN_EMAILS=\n'
  );
  await writeFile(path.join(root, 'scripts/test-e2e.sh'), '#!/bin/bash\nprintf "%s\\n" "$@"\n');
  await writeFile(
    path.join(bin, 'docker'),
    `#!/bin/bash
printf '%s\\0' "$@" >> "$DEV_CLI_LOG"
printf '\\n' >> "$DEV_CLI_LOG"
if [[ "$MOCK_BUILD_FAIL" == 1 ]]; then
  for arg in "$@"; do [[ "$arg" != build ]] || exit 19; done
fi
case "$1 $2" in
  'context show') echo desktop-linux ;;
  'context inspect') if [[ -n "$MOCK_ENDPOINT" ]]; then echo "$MOCK_ENDPOINT"; else echo unix:///tmp/mock-docker.sock; fi ;;
  'volume ls') echo flor-de-cacau_database ;;
esac
`
  );
  await chmod(path.join(bin, 'docker'), 0o755);
  const env: NodeJS.ProcessEnv = { ...process.env, PATH: `${bin}:/usr/bin:/bin`, DEV_CLI_LOG: log };
  delete env.DOCKER_HOST;
  delete env.DOCKER_CONTEXT;
  delete env.COMPOSE_FILE;
  delete env.COMPOSE_PROJECT_NAME;
  try {
    await run({
      root,
      exec: (args, overrides = {}) =>
        spawnSync('bash', [path.join(root, 'dev.sh'), ...args], {
          cwd: temp,
          env: { ...env, ...overrides },
          encoding: 'utf8',
          stdio: ['pipe', 'pipe', 'pipe']
        }),
      calls: async () =>
        (await readFile(log, 'utf8').catch(() => ''))
          .trimEnd()
          .split('\n')
          .filter(Boolean)
          .map((line) => line.split('\0').filter(Boolean))
    });
  } finally {
    await rm(temp, { recursive: true, force: true });
  }
}

test('CLI help and dry-run never invoke Docker or change private settings', async () => {
  await fixture(async ({ exec, calls, root }) => {
    assert.equal(exec(['help']).status, 0);
    const result = exec(['--dry-run', 'reset-db']);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /volume rm flor-de-cacau_database/);
    assert.doesNotMatch(result.stdout, /volume rm .*uploads|--volumes/);
    assert.deepEqual(await calls(), []);
    assert.equal(
      await readFile(path.join(root, '.env.local'), 'utf8'),
      'PRIVATE_SENTINEL=preserve-me\n'
    );
  });
});

test('CLI restart pins checkout/project and recreates app without rebuilding', async () => {
  await fixture(async ({ exec, calls, root }) => {
    const result = exec(['restart'], {
      COMPOSE_PROJECT_NAME: 'production',
      COMPOSE_FILE: '/other/compose.yaml'
    });
    assert.equal(result.status, 0, result.stderr);
    const commands = (await calls()).filter(
      (call) => call[0] === 'compose' && call[1] !== 'version'
    );
    assert.equal(commands.length, 2);
    for (const call of commands) {
      assert.deepEqual(call.slice(0, 7), [
        'compose',
        '--project-name',
        'flor-de-cacau',
        '--file',
        path.join(root, 'compose.yaml'),
        '--env-file',
        path.join(root, '.env.local')
      ]);
      assert.ok(!call.includes('build'));
    }
    assert.deepEqual(commands[1]!.slice(7), [
      'up',
      '-d',
      '--no-deps',
      '--force-recreate',
      '--wait',
      'app'
    ]);
  });
});

test('CLI stops on build failure before restarting or resetting anything', async () => {
  for (const args of [['rebuild'], ['reset-db', '--yes']]) {
    await fixture(async ({ exec, calls }) => {
      assert.equal(exec(args, { MOCK_BUILD_FAIL: '1' }).status, 19);
      const commands = await calls();
      assert.ok(
        !commands.some(
          (call) => call.includes('down') || call.includes('up') || call[0] === 'volume'
        )
      );
    });
  }
});

test('CLI reset requires explicit confirmation and deletes only its database volume', async () => {
  await fixture(async ({ exec, calls }) => {
    const denied = exec(['reset-db']);
    assert.notEqual(denied.status, 0);
    assert.match(denied.stderr, /Reset cancelado/);
    assert.ok(!(await calls()).some((call) => call.includes('down') || call[0] === 'volume'));
    const allowed = exec(['reset-db', '--yes']);
    assert.equal(allowed.status, 0, allowed.stderr);
    const commands = await calls();
    assert.deepEqual(
      commands.filter((call) => call[0] === 'volume' && call[1] === 'rm'),
      [['volume', 'rm', 'flor-de-cacau_database']]
    );
    assert.ok(!commands.some((call) => call.includes('--volumes')));
    const afterRemoval = commands.slice(
      commands.findIndex((call) => call[0] === 'volume' && call[1] === 'rm') + 1
    );
    assert.ok(afterRemoval.some((call) => call.includes('up') && call.at(-1) === 'app'));
    assert.ok(!afterRemoval.some((call) => call.includes('build') || call.includes('--build')));
  });
});

test('CLI rejects remote Docker engines before mutating services', async () => {
  await fixture(async ({ exec, calls }) => {
    const result = exec(['reset-db', '--yes'], { MOCK_ENDPOINT: 'ssh://production.example.test' });
    assert.notEqual(result.status, 0);
    assert.match(result.stderr, /engine Docker local/);
    assert.ok(!(await calls()).some((call) => call[0] === 'compose' || call[0] === 'volume'));
  });
});

test('CLI forwards E2E arguments without the local env file', async () => {
  await fixture(async ({ exec, calls }) => {
    const result = exec(['test', 'npm', 'run', 'test:e2e:run', '--', '--project=chromium']);
    assert.equal(result.status, 0, result.stderr);
    assert.equal(result.stdout, 'npm\nrun\ntest:e2e:run\n--\n--project=chromium\n');
    assert.ok(!(await calls()).some((call) => call.includes('--env-file')));
  });
});

test('CLI init preserves an existing env and generates a private secret for a fresh checkout', async () => {
  await fixture(async ({ exec, root }) => {
    const file = path.join(root, '.env.local');
    assert.equal(exec(['init']).status, 0);
    assert.equal(await readFile(file, 'utf8'), 'PRIVATE_SENTINEL=preserve-me\n');
    await rm(file);
    const result = exec(['init']);
    assert.equal(result.status, 0, result.stderr);
    const contents = await readFile(file, 'utf8');
    assert.match(contents, /^BETTER_AUTH_SECRET=[a-f0-9]{64}\n/);
    assert.equal((await stat(file)).mode & 0o777, 0o600);
    assert.ok(
      !result.stdout.includes(contents.split('\n')[0]!.slice('BETTER_AUTH_SECRET='.length))
    );
  });
});
