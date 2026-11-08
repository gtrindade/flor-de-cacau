#!/usr/bin/env python3
"""Validate a public DNS hostname and update only the HTTPS-related settings."""
import ipaddress
import os
from pathlib import Path
import re
import sys
import tempfile


def validate_hostname(value):
    hostname = value.lower()
    labels = hostname.split('.')
    if len(hostname) > 253 or len(labels) < 2 or any(
        not re.fullmatch(r'[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?', label)
        for label in labels
    ) or hostname.endswith(('.localhost', '.local', '.internal', '.home.arpa')):
        raise ValueError('Informe somente um hostname público, sem protocolo, porta ou caminho.')
    try:
        ipaddress.ip_address(hostname)
    except ValueError:
        return hostname
    raise ValueError('Informe um nome DNS público, não um endereço IP.')


def configure(filename, hostname):
    config = Path(filename)
    lines = config.read_text().splitlines()
    settings = {'ORIGIN': f'https://{hostname}', 'APP_BIND': '127.0.0.1'}
    remaining = dict(settings)
    output = []
    for line in lines:
        key = line.partition('=')[0]
        if key in settings:
            output.append(f'{key}={settings[key]}')
            remaining.pop(key, None)
        else:
            output.append(line)
    output.extend(f'{key}={value}' for key, value in remaining.items())
    descriptor, temporary = tempfile.mkstemp(prefix='.https-env-', dir=config.parent)
    try:
        with os.fdopen(descriptor, 'w') as file:
            file.write('\n'.join(output) + '\n')
        os.replace(temporary, config)
    finally:
        if os.path.exists(temporary):
            os.unlink(temporary)


if __name__ == '__main__':
    try:
        hostname = validate_hostname(sys.argv[1])
        if len(sys.argv) == 3:
            configure(sys.argv[2], hostname)
        print(hostname)
    except (ValueError, IndexError) as error:
        raise SystemExit(str(error))
