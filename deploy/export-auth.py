#!/usr/bin/env python3
"""Export only the admin allowlist and Google credentials; never print them to logs."""
import json
from pathlib import Path
import shlex
import sys

wanted = {'ADMIN_EMAILS', 'GOOGLE_CLIENT_ID', 'GOOGLE_CLIENT_SECRET'}
values = {key: '' for key in wanted}
for line in Path(sys.argv[1]).read_text().splitlines():
    key, separator, value = line.partition('=')
    key = key.strip().removeprefix('export ')
    if separator and key in wanted:
        value = value.strip()
        if value.startswith(('"', "'")):
            parsed = shlex.split(value)
            value = parsed[0] if parsed else ''
        values[key] = value
json.dump(values, sys.stdout)
