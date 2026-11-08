# Implantação no Raspberry

O `deploy.sh`, na raiz do projeto, atualiza o serviço por SSH. O código é enviado como um snapshot, sem depender de um repositório Git remoto. Banco, fotos e configuração privada ficam separados das releases.

A prévia instalada no Raspberry está em [https://flordecacau.ddns.net](https://flordecacau.ddns.net), com certificado Let's Encrypt emitido em 8 de novembro de 2026. Ela contém seis produtos demonstrativos com fotos da loja, preços e disponibilidade fictícios. O admin é restrito à lista privada de contas Google permitidas.

```sh
./deploy.sh update
./deploy.sh status
./deploy.sh logs
./deploy.sh logs-https
./deploy.sh restart
./deploy.sh rollback
```

`update` cria uma cópia dos arquivos, executa os testes de implantação e a suíte E2E em Docker nessa cópia e só então a envia ao Raspberry. Uma edição posterior no workspace não altera a release em andamento. O servidor constrói imagens ARM64, aplica migrations, inicializa uma loja vazia somente se ainda não existir configuração e aguarda a saúde da nova aplicação. A referência `current` só muda após a verificação de saúde.

Uma falha no build preserva a aplicação anterior. Uma falha ao iniciar a nova aplicação tenta restaurar a imagem anterior. `rollback` troca a imagem da aplicação; migrations já aplicadas continuam no banco. Mudanças de schema devem ser compatíveis com a versão anterior.

## Primeira instalação

Requer Debian 13 ARM64, SSH por chave, rsync e Docker Engine/Compose. O instalador revisável [bootstrap-server.sh](bootstrap-server.sh) configura o repositório oficial do Docker, inicia o daemon no boot e associa o usuário ao grupo Docker. Esse grupo permite controle administrativo do daemon. Para preparar um servidor novo, envie o instalador e execute-o uma vez:

```sh
ssh trindade@raspberry-server.local 'mkdir -p /home/trindade/workspace/flor-de-cacau/setup'
scp deploy/bootstrap-server.sh trindade@raspberry-server.local:/home/trindade/workspace/flor-de-cacau/setup/
ssh -t trindade@raspberry-server.local 'sudo bash /home/trindade/workspace/flor-de-cacau/setup/bootstrap-server.sh trindade'
```

Abra uma nova conexão SSH após a instalação. No Mac, configure os e-mails administrativos e as credenciais Google no `.env.local` e execute `./deploy.sh update`. Só esses três campos são copiados para a configuração inicial do servidor. O banco e as sessões recebem novos segredos gerados no próprio Raspberry. Uma configuração existente nunca é sobrescrita automaticamente.

A configuração inicial é privada, com `ORIGIN=http://127.0.0.1:5180` e `APP_BIND=127.0.0.1`. Nesse modo, execute `./deploy.sh tunnel` e abra essa URL no computador. Para usar Google, cadastre a origem e o callback `http://127.0.0.1:5180/api/auth/callback/google` no cliente OAuth.

## Prévia pelo Wi-Fi

Para testar catálogo e pedidos no celular, a configuração pode usar o IP da rede local, por exemplo:

```dotenv
ORIGIN=http://192.168.1.38:5180
APP_BIND=192.168.1.38
APP_PORT=5180
```

Após alterar `shared/.env`, execute `./deploy.sh restart`. O celular precisa estar na mesma rede e ter acesso entre dispositivos. Se o IP do Raspberry mudar, atualize esses valores ou reserve o endereço no DHCP do roteador. Esse modo mantém o admin protegido, mas não permite autenticação Google pelo IP privado: o Google exige um hostname HTTPS, com exceção de localhost/loopback. A prévia atual já usa o modo HTTPS descrito abaixo.

O comando `tunnel` informa quando o servidor está no modo LAN, pois o endereço usado pelo navegador precisa corresponder a `ORIGIN` para os formulários funcionarem.

## HTTPS e No-IP

Depois de registrar um hostname e encaminhar TCP 80/443 para o Raspberry, execute:

```sh
./deploy.sh https flordecacau.ddns.net
```

O comando executa os testes de implantação, envia os arquivos de configuração por SSH e instala o Caddy oficial ARM64 em um projeto Compose separado (`flor-de-cacau-edge`). Valida a configuração antes de trocar a URL, define `ORIGIN=https://flordecacau.ddns.net` e restringe `APP_BIND` a `127.0.0.1`. A validação final conecta ao HTTPS local com o hostname/SNI público e a confiança normal de certificados, sem ignorar erros TLS. Uma falha tenta restaurar a configuração e os serviços anteriores, preservando banco, fotos e volumes de certificados.

O Caddy recebe 80/443, redireciona HTTP para HTTPS, emite e renova certificados Let's Encrypt e encaminha as requisições a `app:3000` na rede Docker existente. Seu estado fica em `shared/https`, fora das releases da aplicação. Atualizações, reinícios e rollback da aplicação mantêm o proxy e os certificados. A API administrativa do Caddy não é publicada no host.

No Google Cloud, o cliente OAuth usa a origem `https://flordecacau.ddns.net` e o retorno `https://flordecacau.ddns.net/api/auth/callback/google`, preservando também localhost para desenvolvimento. As duas contas autorizadas foram incluídas nos usuários de teste do Google; os e-mails permanecem somente na configuração privada. O início do fluxo chegou à seleção de conta, sem erro de callback; cada pessoa ainda deve concluir o login com a própria conta.

A URL por IP/porta deixa de ser a entrada do site: use sempre o hostname HTTPS para os formulários e o login. O encaminhamento 5180 do roteador pode ser removido; o serviço agora publica essa porta somente no loopback do Raspberry. Foundry continua independente na porta 30000.

Inclua o novo hostname na atualização automática do DDNS caso o IP público mude. A configuração desse atualizador ainda deve ser conferida no No-IP/roteador. No plano gratuito, confirme o hostname a cada 30 dias. Mantenha 80/443 acessíveis para a renovação automática dos certificados.

## Persistência e operação

- Diretório: `/home/trindade/workspace/flor-de-cacau`.
- `releases/<id>`: snapshots e arquivos de implantação.
- `current` e `previous`: links para as releases ativa e anterior.
- `update.sh`: atalho no Raspberry para reconstruir a release atual; para enviar código novo, use `./deploy.sh update` no Mac.
- `shared/.env`: configuração privada, permissão 600; sem dados versionados.
- Volume `flor-de-cacau-server_database`: PostgreSQL 18, montado em `/var/lib/postgresql`.
- Volume `flor-de-cacau-server_uploads`: fotos, montado em `/app/uploads`.
- Volumes `flor-de-cacau-edge_caddy_data` e `flor-de-cacau-edge_caddy_config`: certificados, conta ACME e estado do Caddy. Não remover esses volumes em atualizações.
- Logs locais das atualizações: `.local/deploy-logs`; último relatório de testes em `.e2e/artifacts/report`.

Os containers usam `restart: unless-stopped`, e o Docker é habilitado no boot. O PostgreSQL não publica porta no host. Os scripts não executam `down --volumes`, `prune` ou reset de banco. Atualizações concorrentes no servidor são bloqueadas por `flock`. A configuração de backups permanece sob responsabilidade do usuário, conforme combinado.

Para outro servidor, configure `FLORA_HOST` e `FLORA_DEPLOY_ROOT` no ambiente. Os defaults são `trindade@raspberry-server.local` e o diretório acima.

Referências: [Docker no Debian](https://docs.docker.com/engine/install/debian/), [Compose em produção](https://docs.docker.com/compose/how-tos/production/), [callbacks Google](https://developers.google.com/identity/protocols/oauth2/web-server#uri-validation).
