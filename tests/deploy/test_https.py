import json
import os
from pathlib import Path
import subprocess
import tempfile
import unittest

ROOT = Path(__file__).resolve().parents[2]


class HttpsTests(unittest.TestCase):
    def test_hostname_validation_rejects_urls_ips_and_local_names(self):
        for hostname in ('https://flora.ddns.net', 'flora.ddns.net:443', 'flora.ddns.net/x',
                         '127.0.0.1', 'raspberry.local', '-flora.ddns.net', 'flora..net',
                         'flora.ddns.net\nOTHER=bad', 'flora.ddns.net;echo'):
            with self.subTest(hostname=hostname):
                result = subprocess.run(['python3', str(ROOT / 'deploy/https-config.py'), hostname], text=True, capture_output=True)
                self.assertNotEqual(result.returncode, 0)
        result = subprocess.run(['python3', str(ROOT / 'deploy/https-config.py'), 'FlorDeCacau.ddns.net'], text=True, capture_output=True, check=True)
        self.assertEqual(result.stdout.strip(), 'flordecacau.ddns.net')

    def run_setup(self, failure='', existing=False):
        temporary = tempfile.TemporaryDirectory()
        self.addCleanup(temporary.cleanup)
        base = Path(temporary.name).resolve()
        release = base / 'releases/current-release'
        release.mkdir(parents=True)
        (release / 'compose.production.yaml').write_text('services: {}\n')
        (base / 'current').symlink_to(release)
        shared = base / 'shared'
        shared.mkdir()
        config = shared / '.env'
        origin = 'https://old.example.com' if existing else 'http://192.168.1.38:5180'
        original = f'# Keep comments and private values\nORIGIN={origin}\nAPP_BIND=192.168.1.38\nAPP_PORT=5180\nDB_PASSWORD=private-secret\n'
        config.write_text(original)
        config.chmod(0o600)
        if existing:
            edge = shared / 'https'
            edge.mkdir()
            (edge / 'Caddyfile').write_text('previous caddy config\n')
            (edge / 'compose.https.yaml').write_text('services: {}\n')
        binaries = base / 'bin'
        binaries.mkdir()
        log = base / 'commands.jsonl'
        mock = '''#!/usr/bin/env python3
import json, os, pathlib, sys
args=sys.argv[1:]
env_path=pathlib.Path(args[args.index('--env-file')+1]) if '--env-file' in args else None
origin=next((line for line in env_path.read_text().splitlines() if line.startswith('ORIGIN=')), '') if env_path else ''
with open(os.environ['COMMAND_LOG'],'a') as output: output.write(json.dumps({'args':args,'origin':origin})+'\\n')
if os.environ.get('FAIL_AT') == 'pull' and 'pull' in args: sys.exit(23)
'''
        (binaries / 'docker').write_text(mock)
        (binaries / 'flock').write_text('#!/bin/sh\nexit 0\n')
        (binaries / 'readlink').write_text('#!/usr/bin/env python3\nimport os,sys\nprint(os.path.realpath(sys.argv[-1]))\n')
        (binaries / 'curl').write_text('#!/bin/sh\n[ "$FAIL_AT" != tls ]\n')
        (binaries / 'sleep').write_text('#!/bin/sh\nexit 0\n')
        for binary in binaries.iterdir():
            binary.chmod(0o755)
        environment = {**os.environ, 'PATH': str(binaries) + os.pathsep + os.environ['PATH'],
                       'FLORA_DEPLOY_ROOT': str(base), 'COMMAND_LOG': str(log), 'FAIL_AT': failure}
        result = subprocess.run(['bash', str(ROOT / 'deploy/configure-https.sh'), 'flora.example.com'], env=environment, text=True, capture_output=True)
        self.assertNotIn('private-secret', result.stdout + result.stderr)
        commands = [json.loads(line) for line in log.read_text().splitlines()]
        self.assertFalse(any('--volumes' in command['args'] or 'prune' in command['args'] for command in commands))
        self.assertFalse(list(shared.glob('.https-*')))
        self.assertEqual(config.stat().st_mode & 0o777, 0o600)
        return result, shared, original, commands

    def test_success_changes_only_origin_and_bind_and_keeps_proxy_separate(self):
        result, shared, original, commands = self.run_setup()
        self.assertEqual(result.returncode, 0, result.stderr)
        self.assertEqual((shared / '.env').read_text(), original.replace('http://192.168.1.38:5180', 'https://flora.example.com').replace('APP_BIND=192.168.1.38', 'APP_BIND=127.0.0.1'))
        self.assertTrue((shared / 'https/Caddyfile').is_file())
        self.assertTrue(any('validate' in command['args'] for command in commands))
        self.assertTrue(any('flor-de-cacau-edge' in command['args'] and 'up' in command['args'] for command in commands))

    def test_pull_failure_does_not_restart_or_change_configuration(self):
        result, shared, original, commands = self.run_setup('pull')
        self.assertEqual(result.returncode, 23)
        self.assertEqual((shared / '.env').read_text(), original)
        self.assertFalse(any('up' in command['args'] for command in commands))

    def test_tls_failure_restores_previous_app_settings(self):
        result, shared, original, commands = self.run_setup('tls')
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((shared / '.env').read_text(), original)
        self.assertFalse((shared / 'https').exists())
        self.assertTrue(any('app' in command['args'] and command['origin'] == 'ORIGIN=http://192.168.1.38:5180' for command in commands))

    def test_tls_failure_restores_an_existing_proxy_configuration(self):
        result, shared, original, commands = self.run_setup('tls', existing=True)
        self.assertNotEqual(result.returncode, 0)
        self.assertEqual((shared / '.env').read_text(), original)
        self.assertEqual((shared / 'https/Caddyfile').read_text(), 'previous caddy config\n')
        self.assertTrue(any('flor-de-cacau-edge' in command['args'] and 'up' in command['args'] and command['origin'] == 'ORIGIN=https://old.example.com' for command in commands))


if __name__ == '__main__':
    unittest.main()
