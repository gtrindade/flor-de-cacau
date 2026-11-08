#!/usr/bin/env bash
set -euo pipefail
BASE="${FLORA_DEPLOY_ROOT:-/home/trindade/workspace/flor-de-cacau}"
exec 9> "$BASE/shared/update.lock"
flock -n 9 || { echo 'Já existe uma atualização em andamento.' >&2; exit 1; }
previous="$(readlink -f "$BASE/previous" 2>/dev/null || true)"
current="$(readlink -f "$BASE/current" 2>/dev/null || true)"
[[ "$previous" == "$BASE/releases/"* && -f "$previous/compose.production.yaml" ]] || { echo 'Nenhuma release anterior disponível.' >&2; exit 1; }
export RELEASE_ID="$(basename "$previous")"
docker compose --project-name flor-de-cacau-server --file "$previous/compose.production.yaml" \
  --env-file "$BASE/shared/.env" up -d --no-deps --wait app
ln -sfn "$previous" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$BASE/current"
ln -sfn "$current" "$BASE/previous.next"
mv -Tf "$BASE/previous.next" "$BASE/previous"
echo "Aplicação restaurada para $RELEASE_ID. O banco não foi revertido."
