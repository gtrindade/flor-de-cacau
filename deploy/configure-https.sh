#!/usr/bin/env bash
set -euo pipefail
SOURCE="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
BASE="${FLORA_DEPLOY_ROOT:-/home/trindade/workspace/flor-de-cacau}"
[[ $# -eq 1 ]] || { echo 'Uso: configure-https.sh hostname' >&2; exit 1; }
DOMAIN="$(python3 "$SOURCE/https-config.py" "$1")"
ENV_FILE="$BASE/shared/.env"
EDGE="$BASE/shared/https"
[[ -f "$ENV_FILE" && -f "$BASE/current/compose.production.yaml" ]] || {
  echo 'Instale a aplicação antes de configurar HTTPS.' >&2; exit 1;
}
exec 9> "$BASE/shared/update.lock"
flock -n 9 || { echo 'Já existe uma atualização em andamento.' >&2; exit 1; }
export RELEASE_ID="$(basename "$(readlink -f "$BASE/current")")"
APP=(docker compose --project-name flor-de-cacau-server --file "$BASE/current/compose.production.yaml" --env-file "$ENV_FILE")
PROXY=(docker compose --project-name flor-de-cacau-edge --file "$EDGE/compose.https.yaml" --env-file "$ENV_FILE")
docker info >/dev/null
docker network inspect flor-de-cacau-server_default >/dev/null
STAGE="$(mktemp -d "$BASE/shared/.https-XXXXXXXX")"
trap 'rm -rf -- "$STAGE"' EXIT
cp "$ENV_FILE" "$STAGE/env.before"
chmod 600 "$STAGE/env.before"
cp "$STAGE/env.before" "$STAGE/env.next"
python3 "$SOURCE/https-config.py" "$DOMAIN" "$STAGE/env.next" >/dev/null
cp "$SOURCE/Caddyfile" "$SOURCE/compose.https.yaml" "$STAGE/"
had_proxy=0
if [[ -f "$EDGE/compose.https.yaml" ]]; then
  had_proxy=1
  cp -R "$EDGE" "$STAGE/edge.before"
fi
activating=0
restore_on_error() {
  local result=$?
  trap - ERR
  if [[ "$activating" == 1 ]]; then
    echo 'HTTPS não foi validado; restaurando a configuração anterior.' >&2
    cp "$STAGE/env.before" "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    "${APP[@]}" up -d --no-deps --force-recreate --wait app < /dev/null || true
    if [[ "$had_proxy" == 1 ]]; then
      cp "$STAGE/edge.before/Caddyfile" "$STAGE/edge.before/compose.https.yaml" "$EDGE/"
      "${PROXY[@]}" up -d --force-recreate --wait < /dev/null || true
    else
      "${PROXY[@]}" down < /dev/null || true
      rm -rf -- "$EDGE"
    fi
  fi
  echo 'Banco, fotos e volumes de certificados foram preservados.' >&2
  exit "$result"
}
trap restore_on_error ERR

CHECK=(docker compose --project-name flor-de-cacau-edge --file "$STAGE/compose.https.yaml" --env-file "$STAGE/env.next")
"${CHECK[@]}" config --quiet
"${CHECK[@]}" pull caddy < /dev/null
"${CHECK[@]}" run --rm --no-deps -T caddy caddy validate --config /etc/caddy/Caddyfile --adapter caddyfile < /dev/null
mkdir -p "$EDGE"
activating=1
cp "$STAGE/Caddyfile" "$STAGE/compose.https.yaml" "$EDGE/"
mv "$STAGE/env.next" "$ENV_FILE"
"${APP[@]}" up -d --no-deps --force-recreate --wait app < /dev/null
"${PROXY[@]}" up -d --force-recreate --wait < /dev/null
verified=0
for attempt in {1..30}; do
  if curl --noproxy '*' --fail --silent --show-error --connect-timeout 3 --max-time 5 \
    --resolve "$DOMAIN:443:127.0.0.1" "https://$DOMAIN/api/health" > "$STAGE/health.json" 2> "$STAGE/tls.error"; then
    verified=1
    break
  fi
  sleep 2
done
if [[ "$verified" != 1 ]]; then
  cat "$STAGE/tls.error" >&2
  "${PROXY[@]}" logs --tail=40 caddy >&2
  false
fi
trap - ERR
printf 'HTTPS validado: https://%s\n' "$DOMAIN"
echo 'A porta da aplicação agora aceita conexões somente pelo loopback do Raspberry.'
printf 'Callback Google: https://%s/api/auth/callback/google\n' "$DOMAIN"
