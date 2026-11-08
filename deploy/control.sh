#!/usr/bin/env bash
set -euo pipefail
BASE="${FLORA_DEPLOY_ROOT:-/home/trindade/workspace/flor-de-cacau}"
if [[ "${1:-status}" == restart ]]; then
  exec 9> "$BASE/shared/update.lock"
  flock -n 9 || { echo 'Já existe uma atualização em andamento.' >&2; exit 1; }
fi
SOURCE="$(readlink -f "$BASE/current")"
[[ -f "$SOURCE/compose.production.yaml" ]] || { echo 'Nenhuma release ativa.' >&2; exit 1; }
export RELEASE_ID="$(basename "$SOURCE")"
COMPOSE=(docker compose --project-name flor-de-cacau-server --file "$SOURCE/compose.production.yaml" --env-file "$BASE/shared/.env")
PROXY=(docker compose --project-name flor-de-cacau-edge --file "$BASE/shared/https/compose.https.yaml" --env-file "$BASE/shared/.env")
case "${1:-status}" in
  status)
    echo "Release: $RELEASE_ID"
    printf 'URL: %s\n' "$(sed -n 's/^ORIGIN=//p' "$BASE/shared/.env")"
    "${COMPOSE[@]}" ps --all
    if [[ -f "$BASE/shared/https/compose.https.yaml" ]]; then "${PROXY[@]}" ps --all; fi ;;
  logs) "${COMPOSE[@]}" logs --follow --tail=100 app db ;;
  logs-https)
    [[ -f "$BASE/shared/https/compose.https.yaml" ]] || { echo 'HTTPS ainda não configurado.' >&2; exit 1; }
    "${PROXY[@]}" logs --follow --tail=100 caddy ;;
  restart) "${COMPOSE[@]}" up -d --no-deps --force-recreate --wait app ;;
  rollback) exec bash "$SOURCE/deploy/rollback.sh" ;;
  *) echo 'Use status, logs, logs-https, restart ou rollback.' >&2; exit 1 ;;
esac
