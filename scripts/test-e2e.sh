#!/usr/bin/env bash
set -euo pipefail
cd "$(dirname "$0")/.."
if ! command -v docker >/dev/null && [[ -x /Applications/Docker.app/Contents/Resources/bin/docker ]]; then
  export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
fi
task_project="flora-e2e-$(date +%s)-$$"
mkdir -p .e2e/artifacts
task_compose=(docker compose -p "$task_project" -f compose.e2e.yaml)
cleanup() {
  task_result=$?
  trap - EXIT
  "${task_compose[@]}" logs --no-color app init db > .e2e/artifacts/services.log 2>&1 || true
  if [[ "${E2E_KEEP_STACK:-0}" != 1 && "$task_project" == flora-e2e-* ]]; then
    "${task_compose[@]}" down --volumes --remove-orphans >/dev/null || true
  else
    echo "Ambiente preservado: $task_project"
  fi
  exit "$task_result"
}
trap cleanup EXIT
"${task_compose[@]}" build
"${task_compose[@]}" up -d --wait app
"${task_compose[@]}" run --rm --no-deps e2e "$@"
"${task_compose[@]}" restart app
"${task_compose[@]}" up -d --no-deps --wait app
"${task_compose[@]}" run --rm --no-deps e2e node --import tsx scripts/check-persistence.ts
