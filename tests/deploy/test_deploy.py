import json
import os
from pathlib import Path
import shutil
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class DeploymentTests(unittest.TestCase):
    def test_private_config_is_generated_once_and_does_not_reuse_local_database_secret(self):
        with tempfile.TemporaryDirectory() as directory:
            base = Path(directory)
            payload = {'ADMIN_EMAILS': 'admin@example.test', 'GOOGLE_CLIENT_ID': 'fake-id', 'GOOGLE_CLIENT_SECRET': 'fake-secret', 'DB_PASSWORD': 'do-not-copy'}
            result = subprocess.run(['python3', str(ROOT / 'deploy/init-config.py'), str(base)], input=json.dumps(payload), text=True, capture_output=True)
            self.assertEqual(result.returncode, 0, result.stderr)
            config = base / 'shared/.env'
            original = config.read_text()
            self.assertIn('ORIGIN=http://127.0.0.1:5180', original)
            self.assertNotIn('do-not-copy', original)
            self.assertEqual(config.stat().st_mode & 0o777, 0o600)
            self.assertNotIn('fake-secret', result.stdout)
            payload['GOOGLE_CLIENT_SECRET'] = 'changed'
            subprocess.run(['python3', str(ROOT / 'deploy/init-config.py'), str(base)], input=json.dumps(payload), text=True, check=True, capture_output=True)
            self.assertEqual(config.read_text(), original)

    def test_credential_export_has_an_explicit_allowlist(self):
        with tempfile.TemporaryDirectory() as directory:
            config = Path(directory) / '.env.local'
            config.write_text('ADMIN_EMAILS=admin@example.test\nGOOGLE_CLIENT_SECRET="fake-secret"\nDATABASE_URL=do-not-copy\nBETTER_AUTH_SECRET=do-not-copy\n')
            result = subprocess.run(['python3', str(ROOT / 'deploy/export-auth.py'), str(config)], text=True, capture_output=True, check=True)
            self.assertEqual(set(json.loads(result.stdout)), {'ADMIN_EMAILS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'})
            self.assertNotIn('do-not-copy', result.stdout)

    def run_update(self, fail=''):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name).resolve()
        release = base / 'releases/new-release'
        old = base / 'releases/old-release'
        for path in (release, old):
            (path / 'deploy').mkdir(parents=True)
            (path / 'compose.production.yaml').write_text('services: {}\n')
        shutil.copy2(ROOT / 'deploy/server-update.sh', release / 'deploy/server-update.sh')
        (base / 'shared').mkdir()
        (base / 'shared/.env').write_text('KEEP=private\n')
        (base / 'current').symlink_to(old)
        binaries = base / 'bin'
        binaries.mkdir()
        log = base / 'commands.jsonl'
        mock = '''#!/usr/bin/env python3
import json, os, pathlib, sys
args=sys.argv[1:]
with open(os.environ['COMMAND_LOG'],'a') as output: output.write(json.dumps({'args':args,'release':os.getenv('RELEASE_ID')})+'\\n')
failure=os.getenv('FAIL_AT','')
marker=pathlib.Path(os.environ['COMMAND_LOG']+'.failed')
if (failure=='build' and 'build' in args) or (failure=='app' and 'up' in args and args[-1]=='app' and not marker.exists()):
    marker.touch(); sys.exit(23)
'''
        (binaries / 'docker').write_text(mock)
        (binaries / 'flock').write_text('#!/bin/sh\nexit 0\n')
        # Linux-only commands are modeled for tests running on macOS too.
        (binaries / 'readlink').write_text('#!/usr/bin/env python3\nimport os,sys\nprint(os.path.realpath(sys.argv[-1]))\n')
        (binaries / 'mv').write_text('#!/usr/bin/env python3\nimport os,sys\nargs=[arg for arg in sys.argv[1:] if arg != "-Tf"]\nos.replace(args[0],args[1])\n')
        for binary in binaries.iterdir():
            binary.chmod(0o755)
        environment = {**os.environ, 'PATH': str(binaries) + os.pathsep + os.environ['PATH'], 'FLORA_DEPLOY_ROOT': str(base), 'COMMAND_LOG': str(log), 'FAIL_AT': fail}
        result = subprocess.run(['bash', str(release / 'deploy/server-update.sh')], env=environment, text=True, capture_output=True)
        self.assertTrue(log.exists(), result.stderr)
        commands = [json.loads(line) for line in log.read_text().splitlines()]
        return result, base, release, old, commands

    def test_success_switches_release_only_after_healthcheck_and_keeps_previous(self):
        result, base, release, old, commands = self.run_update()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((base / 'current').resolve(), release)
        self.assertEqual((base / 'previous').resolve(), old)
        self.assertEqual((base / 'shared/.env').read_text(), 'KEEP=private\n')
        self.assertTrue(any('db:seed' in item['args'] and item['args'][-1] == 'empty' for item in commands))
        self.assertFalse(any('--volumes' in item['args'] or 'prune' in item['args'] for item in commands))

    def test_build_failure_preserves_running_release(self):
        result, base, release, old, commands = self.run_update('build')
        self.assertEqual(result.returncode, 23)
        self.assertEqual((base / 'current').resolve(), old)
        self.assertFalse(any('up' in item['args'] or 'db:migrate' in item['args'] for item in commands))

    def test_failed_app_start_restores_previous_image_without_touching_volumes(self):
        result, base, release, old, commands = self.run_update('app')
        self.assertEqual(result.returncode, 23)
        self.assertEqual((base / 'current').resolve(), old)
        self.assertTrue(any(item['release'] == 'old-release' and 'up' in item['args'] for item in commands))
        self.assertFalse(any('--volumes' in item['args'] for item in commands))


if __name__ == '__main__':
    unittest.main()
