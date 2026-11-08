#!/usr/bin/env bash
set -euo pipefail

if [[ "$EUID" != 0 ]]; then
  echo 'Execute este instalador com sudo, informando o usuário de implantação.' >&2
  exit 1
fi
DEPLOY_USER="${1:-${SUDO_USER:-}}"
[[ -n "$DEPLOY_USER" && "$DEPLOY_USER" != root ]] || { echo 'Informe um usuário existente, diferente de root.' >&2; exit 1; }
id "$DEPLOY_USER" >/dev/null
. /etc/os-release
[[ "$ID" == debian && "$VERSION_CODENAME" == trixie ]] || { echo 'Este instalador foi preparado para Debian 13 (trixie).' >&2; exit 1; }
[[ "$(dpkg --print-architecture)" == arm64 ]] || { echo 'Este instalador foi preparado para ARM64.' >&2; exit 1; }

if ! command -v docker >/dev/null; then
  # Não remove runtimes ou pacotes de outros serviços automaticamente.
  for package in docker.io docker-compose docker-doc podman-docker containerd runc; do
    if dpkg-query -W -f='${Status}' "$package" 2>/dev/null | grep -q 'install ok installed'; then
      echo "Pacote existente exige revisão antes de instalar Docker CE: $package" >&2
      exit 1
    fi
  done
  apt-get update
  apt-get install -y ca-certificates curl
  install -m 0755 -d /etc/apt/keyrings
  curl --fail --silent --show-error --location https://download.docker.com/linux/debian/gpg -o /etc/apt/keyrings/docker.asc
  chmod 0644 /etc/apt/keyrings/docker.asc
  if [[ -e /etc/apt/sources.list.d/docker.sources ]]; then
    grep -q '^URIs: https://download.docker.com/linux/debian$' /etc/apt/sources.list.d/docker.sources || {
      echo 'A configuração existente do repositório Docker precisa de revisão.' >&2; exit 1;
    }
  else
    cat > /etc/apt/sources.list.d/docker.sources <<'REPO'
Types: deb
URIs: https://download.docker.com/linux/debian
Suites: trixie
Components: stable
Architectures: arm64
Signed-By: /etc/apt/keyrings/docker.asc
REPO
  fi
  apt-get update
  apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin
fi

systemctl enable --now docker
docker compose version
# O usuário poderá administrar Docker por SSH sem usar sudo em cada atualização.
# A associação a docker concede controle administrativo sobre o daemon Docker.
usermod -aG docker "$DEPLOY_USER"
printf '\nDocker pronto. Abra uma nova conexão SSH para atualizar os grupos do usuário.\n'
printf 'O instalador não altera Foundry, MariaDB, Samba nem encaminhamento de portas.\n'
