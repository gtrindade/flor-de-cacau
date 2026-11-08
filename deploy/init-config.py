#!/usr/bin/env python3
"""Create a private server configuration from selected credentials on stdin."""
import json
import os
from pathlib import Path
import secrets
import sys

base = Path(sys.argv[1])
incoming = json.load(sys.stdin)
shared = base / 'shared'
shared.mkdir(mode=0o700, parents=True, exist_ok=True)
config = shared / '.env'
if config.exists():
    print('Configuração privada existente preservada.')
    raise SystemExit(0)
if not incoming.get('ADMIN_EMAILS', '').strip():
    raise SystemExit('Configure ADMIN_EMAILS no .env.local antes de implantar.')
values = {
    'DB_PASSWORD': secrets.token_hex(32),
    'BETTER_AUTH_SECRET': secrets.token_hex(32),
    'ORIGIN': 'http://127.0.0.1:5180',
    'APP_PORT': '5180',
    'APP_BIND': '127.0.0.1',
    **{key: incoming.get(key, '') for key in ('ADMIN_EMAILS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET')}
}
for value in values.values():
    if any(character in value for character in '\r\n$'):
        raise SystemExit('Valor de configuração incompatível com o formato .env.')
descriptor = os.open(config, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
with os.fdopen(descriptor, 'w') as file:
    for key, value in values.items():
        file.write(f'{key}={value}\n')
print('Configuração privada criada com novos segredos para o servidor.')
