#!/usr/bin/env bash
set -euo pipefail

ROOT="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
cd "$ROOT"
PROJECT=flor-de-cacau
DRY_RUN=0
if [[ "${1:-}" == --dry-run ]]; then
  DRY_RUN=1
  shift
fi
COMMAND="${1:-help}"
if [[ $# -gt 0 ]]; then shift; fi

usage() {
  cat <<'HELP'
Uso: ./dev.sh [--dry-run] <comando> [argumentos]

  init                 Cria .env.local com segredo aleatório, se ainda não existir
  up                   Compila e sobe app + PostgreSQL, com migrations e seed inicial
  down                 Para e remove containers/rede; preserva banco e fotos
  stop                 Para os containers, sem removê-los
  restart              Recria o app e recarrega .env.local, sem recompilar
  build                Compila as imagens app/init, sem reiniciar serviços
  rebuild              Recompila e sobe a aplicação atualizada
  status               Mostra todos os serviços locais
  logs [app|db|init...] Acompanha logs (padrão: app; Ctrl+C para sair)
  shell [comando...]   Abre sh no app ou executa o comando informado
  db [argumentos...]   Abre psql no banco local; aceita argumentos do psql
  migrate              Aplica migrations no banco local
  seed [demo|empty]    Seed inicial (padrão: demo); preserva loja já configurada
  refresh-demo         Insere as demonstrações com fotos da loja sem sobrescrever produtos
  reset-db [--yes]     Apaga o banco local e recria migrations + catálogo demo
                       Preserva fotos e .env.local; exige confirmação ou --yes
  check                Verifica TypeScript e Svelte em Docker
  test-unit            Executa os testes unitários em Docker
  test [comando...]    Suíte E2E isolada; argumentos vão para scripts/test-e2e.sh
  report               Serve o último relatório E2E em http://localhost:9323
  help                 Mostra esta ajuda

Exemplos:
  ./dev.sh restart
  ./dev.sh rebuild
  ./dev.sh --dry-run reset-db
  ./dev.sh test npm run test:e2e:run -- --project=chromium

App: http://localhost:5173 | Admin: http://localhost:5173/admin
Todos os comandos Docker locais usam compose.yaml e o projeto flor-de-cacau.
HELP
}

die() { printf 'Erro: %s\n' "$*" >&2; exit 1; }
no_args() { [[ $# -eq 0 ]] || die "Argumentos inesperados para '$COMMAND'. Veja ./dev.sh help."; }
run() {
  if [[ "$DRY_RUN" == 1 ]]; then
    printf '[dry-run] '
    printf '%q ' "$@"
    printf '\n'
  else
    "$@"
  fi
}
require_env() {
  [[ -f "$ROOT/.env.local" ]] || die 'Crie a configuração privada com ./dev.sh init.'
}

init_env() {
  no_args "$@"
  if [[ -e "$ROOT/.env.local" ]]; then
    printf '.env.local já existe; configuração preservada.\n'
  elif [[ "$DRY_RUN" == 1 ]]; then
    printf '[dry-run] Criar .env.local privado com segredo aleatório.\n'
  else
    local secret
    secret="$(LC_ALL=C od -An -N32 -tx1 /dev/urandom | tr -d ' \n')"
    [[ "$secret" =~ ^[a-f0-9]{64}$ ]] || die 'Não foi possível gerar BETTER_AUTH_SECRET.'
    (
      umask 077
      set -o noclobber
      awk -v secret="$secret" '
        /^BETTER_AUTH_SECRET=/ { print "BETTER_AUTH_SECRET=" secret; next }
        { print }
      ' "$ROOT/.env.example" > "$ROOT/.env.local"
    )
    printf '.env.local criado. Configure ADMIN_EMAILS e as credenciais Google nesse arquivo.\n'
  fi
}

case "$COMMAND" in
  help|-h|--help) no_args "$@"; usage; exit 0 ;;
  init) init_env "$@"; exit 0 ;;
  up|down|stop|restart|build|rebuild|status|logs|shell|db|migrate|seed|refresh-demo|reset-db|check|test-unit|test|report) ;;
  *) usage >&2; die "Comando desconhecido: $COMMAND" ;;
esac

# Docker Desktop nem sempre instala os atalhos no PATH do Mac.
if ! command -v docker >/dev/null && [[ -x /Applications/Docker.app/Contents/Resources/bin/docker ]]; then
  export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi

require_docker() {
  [[ "$DRY_RUN" == 0 ]] || return 0
  command -v docker >/dev/null || die 'Instale Docker Desktop e inicie o engine.'
  local endpoint context
  if [[ -n "${DOCKER_CONTEXT:-}" ]]; then
    context="$DOCKER_CONTEXT"
    endpoint="$(docker context inspect "$context" --format '{{(index .Endpoints "docker").Host}}')"
  elif [[ -n "${DOCKER_HOST:-}" ]]; then
    endpoint="$DOCKER_HOST"
  else
    context="$(docker context show)"
    endpoint="$(docker context inspect "$context" --format '{{(index .Endpoints "docker").Host}}')"
  fi
  case "$endpoint" in
    unix://*|npipe://*|tcp://localhost:*|tcp://127.0.0.1:*|tcp://\[::1\]:*) ;;
    *) die 'Este utilitário exige um engine Docker local. Selecione o contexto local do Docker.' ;;
  esac
  docker info >/dev/null 2>&1 || die 'O engine Docker não está disponível. Abra Docker Desktop.'
  docker compose version >/dev/null 2>&1 || die 'Docker Compose v2 é necessário.'
}

require_docker
if [[ "$COMMAND" == test ]]; then
  # O runner E2E tem projeto, banco e credenciais próprios; não recebe .env.local.
  run bash "$ROOT/scripts/test-e2e.sh" "$@"
  exit 0
fi
require_env
COMPOSE=(docker compose --project-name "$PROJECT" --file "$ROOT/compose.yaml" --env-file "$ROOT/.env.local")
compose() { run "${COMPOSE[@]}" "$@"; }
ensure_db() { compose up -d --wait db; }
build_tools() { compose build init; }
tool() { compose run --rm --no-deps init "$@"; }
up() {
  compose up --build -d --wait app
  printf 'Aplicação: http://localhost:5173\n'
}

reset_db() {
  local confirmed=0 answer
  if [[ $# -gt 0 && "$1" == --yes ]]; then confirmed=1; shift; fi
  no_args "$@"
  if [[ "$DRY_RUN" == 0 && "$confirmed" == 0 ]]; then
    printf 'Isso apaga produtos, categorias, configurações e sessões do banco local.\n'
    printf 'Fotos e .env.local serão preservados.\n'
    [[ -t 0 ]] || die 'Reset cancelado. Em automações, use reset-db --yes explicitamente.'
    printf 'Digite RESETAR FLORA LOCAL para continuar: '
    IFS= read -r answer || die 'Reset cancelado.'
    [[ "$answer" == 'RESETAR FLORA LOCAL' ]] || die 'Reset cancelado.'
  fi
  # Compila antes de parar serviços ou apagar dados: falha de build preserva o banco.
  compose build app init
  compose down
  if [[ "$DRY_RUN" == 1 ]] || [[ -n "$(docker volume ls --quiet --filter "name=^${PROJECT}_database$")" ]]; then
    run docker volume rm "${PROJECT}_database"
  fi
  compose up -d --wait app
  printf 'Aplicação: http://localhost:5173\n'
}

case "$COMMAND" in
  up) no_args "$@"; up ;;
  down|stop) no_args "$@"; compose "$COMMAND" ;;
  restart)
    no_args "$@"
    ensure_db
    compose up -d --no-deps --force-recreate --wait app
    ;;
  build) no_args "$@"; compose build app init ;;
  rebuild)
    no_args "$@"
    compose build app init
    compose up -d --wait app
    ;;
  status) no_args "$@"; compose ps --all ;;
  logs)
    if [[ $# -eq 0 ]]; then set -- app; fi
    for service in "$@"; do
      case "$service" in app|db|init) ;; *) die "Serviço inválido: $service" ;; esac
    done
    compose logs --follow --tail=100 "$@"
    ;;
  shell)
    if [[ $# -eq 0 ]]; then set -- sh; fi
    compose exec app "$@"
    ;;
  db)
    if [[ -t 0 ]]; then
      compose exec db psql -U flora -d flora "$@"
    else
      compose exec -T db psql -U flora -d flora "$@"
    fi
    ;;
  migrate)
    no_args "$@"
    build_tools; ensure_db
    tool npm run db:migrate
    ;;
  seed)
    mode="${1:-demo}"
    if [[ $# -gt 0 ]]; then shift; fi
    no_args "$@"
    case "$mode" in demo|empty) ;; *) die 'Use seed demo ou seed empty.' ;; esac
    build_tools; ensure_db
    tool npm run db:migrate
    tool npm run db:seed -- --mode "$mode"
    ;;
  refresh-demo)
    no_args "$@"
    build_tools; ensure_db
    tool npm run db:seed -- --mode demo --refresh-demo
    ;;
  reset-db) reset_db "$@" ;;
  check|test-unit)
    no_args "$@"
    build_tools
    if [[ "$COMMAND" == check ]]; then task=check; else task=test:unit; fi
    tool npm run "$task"
    ;;
  report)
    no_args "$@"
    [[ "$DRY_RUN" == 1 || -f "$ROOT/.e2e/artifacts/report/index.html" ]] || die 'Execute ./dev.sh test para gerar o relatório.'
    build_tools
    printf 'Relatório: http://localhost:9323 (Ctrl+C para encerrar).\n'
    compose run --rm --no-deps --publish 127.0.0.1:9323:9323 \
      --volume "$ROOT/.e2e/artifacts/report:/app/report:ro" \
      init npm exec playwright -- show-report /app/report --host 0.0.0.0 --port 9323
    ;;
esac
