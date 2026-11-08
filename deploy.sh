#!/usr/bin/env bash
set -euo pipefail
ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
HOST="${FLORA_HOST:-trindade@raspberry-server.local}"
BASE="${FLORA_DEPLOY_ROOT:-/home/trindade/workspace/flor-de-cacau}"
COMMAND="${1:-help}"
if [[ $# -gt 0 ]]; then shift; fi
DOMAIN=''
if [[ "$COMMAND" == https && $# -eq 1 ]]; then DOMAIN="$1"; shift; fi
[[ $# -eq 0 ]] || { echo 'Argumentos inesperados. Use ./deploy.sh help.' >&2; exit 1; }
case "$COMMAND" in
  help|-h|--help)
    cat <<'HELP'
Uso: ./deploy.sh <comando>
  update    Cria snapshot, executa E2E, envia por SSH e atualiza o serviço
  status    Mostra a release e os containers do servidor
  logs      Acompanha logs da aplicação e do PostgreSQL
  logs-https Acompanha logs do Caddy e da emissão de certificados
  restart   Reinicia o app e recarrega a configuração privada do servidor
  rollback  Volta à imagem anterior da aplicação, sem reverter o banco
  https HOST Configura HTTPS automático para um hostname público
  tunnel    Abre http://127.0.0.1:5180 por túnel SSH (Ctrl+C encerra)
  help      Mostra esta ajuda

Configuração opcional: FLORA_HOST e FLORA_DEPLOY_ROOT.
O update usa Docker local para testar e Docker ARM64 no Raspberry para compilar.
Banco, fotos e configuração privada permanecem separados das releases.
HELP
    exit 0 ;;
  update|status|logs|logs-https|restart|rollback|tunnel|https) ;;
  *) echo 'Comando desconhecido. Use ./deploy.sh help.' >&2; exit 1 ;;
esac
[[ "$HOST" =~ ^[a-zA-Z0-9._@-]+$ ]] || { echo 'FLORA_HOST inválido.' >&2; exit 1; }
[[ "$BASE" =~ ^/[a-zA-Z0-9._/-]+$ && "$BASE" != / && "$BASE" != *'/../'* ]] || { echo 'FLORA_DEPLOY_ROOT inválido.' >&2; exit 1; }
SSH=(ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10)

if [[ "$COMMAND" == https ]]; then
  [[ -n "$DOMAIN" ]] || { echo 'Uso: ./deploy.sh https flordecacau.ddns.net' >&2; exit 1; }
  DOMAIN="$(python3 "$ROOT/deploy/https-config.py" "$DOMAIN")"
  python3 -m unittest discover -s "$ROOT/tests/deploy" -p 'test_*.py'
  flora_setup_id="$(date -u +%Y%m%dT%H%M%SZ)-$$"
  flora_setup="$BASE/setup/https/$flora_setup_id"
  mkdir -p "$ROOT/.local/deploy-logs"
  "${SSH[@]}" "$HOST" "mkdir -p '$flora_setup'"
  rsync -az -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10' \
    "$ROOT/deploy/Caddyfile" "$ROOT/deploy/compose.https.yaml" \
    "$ROOT/deploy/configure-https.sh" "$ROOT/deploy/https-config.py" "$HOST:$flora_setup/"
  "${SSH[@]}" "$HOST" "FLORA_DEPLOY_ROOT='$BASE' bash '$flora_setup/configure-https.sh' '$DOMAIN'" \
    2>&1 | tee "$ROOT/.local/deploy-logs/$flora_setup_id-https.log"
  exit 0
elif [[ "$COMMAND" == tunnel ]]; then
  flora_origin="$("${SSH[@]}" "$HOST" "sed -n 's/^ORIGIN=//p' '$BASE/shared/.env'")"
  if [[ "$flora_origin" != http://127.0.0.1:5180 ]]; then
    printf 'O servidor está configurado para acesso direto: %s\n' "$flora_origin" >&2
    echo 'O túnel requer ORIGIN=http://127.0.0.1:5180 e APP_BIND=127.0.0.1 no shared/.env.' >&2
    exit 1
  fi
  echo 'Túnel: http://127.0.0.1:5180 — mantenha este comando em execução.'
  exec "${SSH[@]}" -o ExitOnForwardFailure=yes -N -L 5180:127.0.0.1:5180 "$HOST"
elif [[ "$COMMAND" != update ]]; then
  exec "${SSH[@]}" "$HOST" "FLORA_DEPLOY_ROOT='$BASE' bash '$BASE/current/deploy/control.sh' '$COMMAND'"
fi

command -v rsync >/dev/null || { echo 'rsync é necessário.' >&2; exit 1; }
command -v python3 >/dev/null || { echo 'python3 é necessário.' >&2; exit 1; }
[[ -f .env.local ]] || { echo 'Configure .env.local antes de implantar.' >&2; exit 1; }
RELEASE="$(date -u +%Y%m%dT%H%M%SZ)-$$"
STAGE="$ROOT/.local/deploy-staging/$RELEASE"
mkdir -p "$STAGE" "$ROOT/.local/deploy-logs"
EXCLUDES=(--include=.env.example --exclude=.env --exclude='.env.*' --exclude=.git --exclude=node_modules
  --exclude=.local --exclude=.e2e --exclude=.svelte-kit --exclude=build --exclude=design
  --exclude=uploads --exclude=playwright-report --exclude=test-results --exclude=blob-report
  --exclude=.auth --exclude=__pycache__ --exclude=.DS_Store --exclude='._*')
rsync -a "${EXCLUDES[@]}" "$ROOT/" "$STAGE/"
python3 -m unittest discover -s "$STAGE/tests/deploy" -p 'test_*.py'
echo "Validando snapshot $RELEASE..."
flora_test_result=0
bash "$STAGE/scripts/test-e2e.sh" 2>&1 | tee "$ROOT/.local/deploy-logs/$RELEASE-tests.log" || flora_test_result=$?
# Preserve the latest report at the familiar local path.
mkdir -p "$ROOT/.e2e/artifacts"
rsync -a "$STAGE/.e2e/artifacts/" "$ROOT/.e2e/artifacts/"
if [[ "$flora_test_result" != 0 ]]; then
  echo 'Validação reprovada; nenhuma alteração foi enviada ao servidor.' >&2
  exit "$flora_test_result"
fi
"${SSH[@]}" "$HOST" "mkdir -p '$BASE/releases'; mkdir '$BASE/releases/$RELEASE'"
rsync -az -e 'ssh -o BatchMode=yes -o StrictHostKeyChecking=yes -o ConnectTimeout=10' \
  "${EXCLUDES[@]}" "$STAGE/" "$HOST:$BASE/releases/$RELEASE/"
# Only these credentials cross SSH; DB/session secrets are generated on the server.
python3 "$ROOT/deploy/export-auth.py" "$ROOT/.env.local" |
  "${SSH[@]}" "$HOST" "python3 '$BASE/releases/$RELEASE/deploy/init-config.py' '$BASE'"
"${SSH[@]}" "$HOST" "FLORA_DEPLOY_ROOT='$BASE' bash '$BASE/releases/$RELEASE/deploy/server-update.sh'" \
  2>&1 | tee "$ROOT/.local/deploy-logs/$RELEASE-server.log"
echo "Atualização concluída: $RELEASE. Consulte a URL por ./deploy.sh status."
