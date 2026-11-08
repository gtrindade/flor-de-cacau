#!/usr/bin/env bash
set -euo pipefail

SCRIPT="$(readlink -f "${BASH_SOURCE[0]}")"
SOURCE="$(cd -- "$(dirname -- "$SCRIPT")/.." && pwd)"
BASE="${FLORA_DEPLOY_ROOT:-/home/trindade/workspace/flor-de-cacau}"
RELEASE="$(basename "$SOURCE")"
[[ "$SOURCE" == "$BASE/releases/$RELEASE" && "$RELEASE" =~ ^[a-zA-Z0-9._-]+$ ]] || {
  echo 'Execute este script dentro de uma release no diretório de implantação.' >&2; exit 1;
}
ENV_FILE="$BASE/shared/.env"
[[ -f "$ENV_FILE" ]] || { echo 'Configuração privada ausente: shared/.env' >&2; exit 1; }
command -v docker >/dev/null || { echo 'Execute setup/bootstrap-server.sh primeiro.' >&2; exit 1; }
docker info >/dev/null
mkdir -p "$BASE/shared"
exec 9> "$BASE/shared/update.lock"
flock -n 9 || { echo 'Já existe uma atualização em andamento.' >&2; exit 1; }

export RELEASE_ID="$RELEASE"
COMPOSE=(docker compose --project-name flor-de-cacau-server --file "$SOURCE/compose.production.yaml" --env-file "$ENV_FILE")
previous=''
if [[ -L "$BASE/current" && -f "$BASE/current/compose.production.yaml" ]]; then
  previous="$(readlink -f "$BASE/current")"
fi
swapping=0
rollback_on_error() {
  local result=$?
  trap - ERR
  if [[ "$swapping" == 1 && -n "$previous" && -f "$previous/compose.production.yaml" ]]; then
    echo 'A nova aplicação não ficou saudável; restaurando a imagem anterior.' >&2
    RELEASE_ID="$(basename "$previous")" docker compose --project-name flor-de-cacau-server \
      --file "$previous/compose.production.yaml" --env-file "$ENV_FILE" up -d --no-deps --wait app || true
  fi
  echo 'Atualização interrompida. Banco e uploads foram preservados.' >&2
  exit "$result"
}
trap rollback_on_error ERR

cd "$SOURCE"
"${COMPOSE[@]}" config --quiet
"${COMPOSE[@]}" build app init
"${COMPOSE[@]}" up -d --wait db
"${COMPOSE[@]}" run --rm --no-deps -T init npm run db:migrate < /dev/null
"${COMPOSE[@]}" run --rm --no-deps -T init npm run db:seed -- --mode empty < /dev/null
swapping=1
"${COMPOSE[@]}" up -d --no-deps --wait app
"${COMPOSE[@]}" exec -T app node -e "fetch('http://127.0.0.1:3000/api/health').then(async r=>{if(!r.ok)process.exit(1);console.log(await r.text())}).catch(()=>process.exit(1))" < /dev/null
if [[ -n "$previous" && "$previous" != "$SOURCE" ]]; then
  ln -sfn "$previous" "$BASE/previous.next"
  mv -Tf "$BASE/previous.next" "$BASE/previous"
fi
ln -sfn "$SOURCE" "$BASE/current.next"
mv -Tf "$BASE/current.next" "$BASE/current"
ln -sfn "$BASE/current/deploy/server-update.sh" "$BASE/update.sh"
trap - ERR
printf 'Release ativa: %s\n' "$RELEASE"
printf 'URL configurada: %s\n' "$(sed -n 's/^ORIGIN=//p' "$ENV_FILE")"
