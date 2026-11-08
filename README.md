# Flor de Cacau

Catálogo da floricultura com pedidos pelo WhatsApp e administração mobile. SvelteKit 3, Svelte 5, TypeScript estrito, shadcn-svelte/Bits UI, Tailwind 4, PostgreSQL 18, Drizzle e Better Auth. Não há carrinho, pagamento nem armazenamento de solicitações.

## Executar tudo com Docker

Requer Docker Desktop com o engine iniciado e Docker Compose. O comando abaixo constrói a aplicação, aplica migrations, carrega demonstrações somente em banco ainda vazio e inicia o servidor:

```sh
./dev.sh init # cria .env.local com segredo aleatório, se ainda não existir
# Preencha ADMIN_EMAILS e as credenciais Google no arquivo privado.
./dev.sh up
```

Abra [http://localhost:5173](http://localhost:5173). Admin em `/admin`, entrada Google em `/entrar`. PostgreSQL local em `127.0.0.1:55432`. Os volumes `database` e `uploads` preservam dados entre reinícios. `docker compose down` para os serviços sem apagar dados; `down --volumes` remove esses dados e não deve ser usado para atualizações.

O `dev.sh` encontra automaticamente a instalação padrão do Docker Desktop no Mac. Para chamar `docker` diretamente quando os atalhos de terminal não foram instalados:

```sh
export PATH="/Applications/Docker.app/Contents/Resources/bin:$PATH"
```

O seed é identificado como demonstrativo na interface. As fotos dos produtos demonstrativos são da própria loja, importadas do perfil público no Google Maps. Preços e disponibilidade são fictícios e não representam o estoque real. O cartão começa desativado. Cadastre os produtos reais e retire o aviso em **A loja** quando estiver pronto.

Para atualizar um banco demonstrativo antigo com as seis fotos da loja:

```sh
npm run db:seed -- --mode demo --refresh-demo
```

O comando exige que a loja esteja marcada como demonstração. Insere os novos exemplos sem sobrescrever produtos existentes e oculta apenas os exemplos antigos que ainda correspondem aos dados originais. Os produtos não são apagados. O seed E2E continua separado e determinístico.

## Utilidades locais

O [dev.sh](dev.sh) concentra os comandos e usa Node dentro dos containers. Execute `./dev.sh help` para ver todas as opções. Ele resolve os caminhos a partir da raiz do projeto, fixa `compose.yaml` e o projeto Compose `flor-de-cacau`, e exige um engine Docker local.

| Comando                                      | Uso                                                                            |
| -------------------------------------------- | ------------------------------------------------------------------------------ |
| `./dev.sh up`                                | Compilar e subir app + banco, com migrations e seed inicial.                   |
| `./dev.sh restart`                           | Recriar o app para recarregar `.env.local`, sem recompilar.                    |
| `./dev.sh build`                             | Compilar as imagens sem alterar os serviços em execução.                       |
| `./dev.sh rebuild`                           | Recompilar e atualizar a aplicação em execução.                                |
| `./dev.sh stop` / `./dev.sh down`            | Parar, ou parar e remover containers/rede, preservando volumes.                |
| `./dev.sh status` / `./dev.sh logs app db`   | Ver serviços e acompanhar logs.                                                |
| `./dev.sh shell` / `./dev.sh db`             | Abrir shell no app ou psql no PostgreSQL.                                      |
| `./dev.sh migrate`                           | Aplicar migrations.                                                            |
| `./dev.sh seed demo` / `./dev.sh seed empty` | Inicializar loja demonstrativa ou sem produtos; preservar loja já configurada. |
| `./dev.sh refresh-demo`                      | Importar os exemplos com fotos da loja em um banco demonstrativo existente.    |
| `./dev.sh reset-db`                          | Recriar o banco local e o catálogo demo, com confirmação digitada.             |
| `./dev.sh check` / `./dev.sh test-unit`      | Checar TypeScript/Svelte e executar testes unitários em Docker.                |
| `./dev.sh test`                              | Executar a suíte completa em ambiente Docker descartável e isolado.            |
| `./dev.sh report`                            | Servir o último relatório E2E em `http://localhost:9323`.                      |

`restart` recarrega credenciais porque recria o container; `docker compose restart` sozinho não atualiza variáveis de ambiente. Para mudanças no código ou nas dependências, use `rebuild`.

O reset remove somente o volume `flor-de-cacau_database`, incluindo produtos, configurações, usuários e sessões locais. O volume de fotos e o arquivo `.env.local` são preservados, mas as referências das fotos aos produtos são perdidas com o banco. O script pede a frase `RESETAR FLORA LOCAL`; em automações, `./dev.sh reset-db --yes` confirma explicitamente a operação. O build ocorre antes da remoção de dados, para que uma falha de compilação não apague o banco.

Para inspecionar os comandos sem executá-los, use `./dev.sh --dry-run reset-db` (ou outro comando). Para executar SQL pontual:

```sh
./dev.sh db -c 'SELECT name, publication FROM products;'
```

## Desenvolvimento com hot reload

Requer Node 24 LTS e npm, além do Docker para o PostgreSQL:

```sh
npm ci
docker compose up -d db
npm run db:migrate
npm run db:seed -- --mode demo
npm run dev
```

Não execute o servidor Docker e o Vite simultaneamente na porta 5173. `.env.local` é carregado pelo Vite e pelos comandos de banco. As versões das dependências estão fixadas no `package-lock.json`; use `npm ci` para instalações reproduzíveis.

```sh
npm run check
npm run test:unit
npm run build
npm run format
```

## Google e acesso administrativo

O painel não oferece login alternativo. Sem credenciais OAuth, a página de entrada explica que a configuração está pendente.

1. No Google Cloud/Google Auth Platform, configure consentimento e um cliente OAuth do tipo **Web application**. Durante o modo de teste do Google, inclua os usuários que usarão o painel.
2. Para desenvolvimento, cadastre a origem `http://localhost:5173` e o retorno exato `http://localhost:5173/api/auth/callback/google`.
3. Configure `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET`, `BETTER_AUTH_URL`, `ORIGIN`, `BETTER_AUTH_SECRET` e `ADMIN_EMAILS` no `.env.local`. A lista de e-mails usa vírgulas. Nenhum e-mail real é incluído na documentação.
4. Execute `./dev.sh restart`, entre pela página `/entrar` e confira o acesso com a conta permitida. Repita esse smoke test ao alterar domínio, callbacks ou credenciais.

O servidor de produção usa `scripts/start.ts` e a origem explícita de `ORIGIN` (ou `BETTER_AUTH_URL`). Ele sobrescreve os cabeçalhos internos usados pelo adapter para que a origem HTTP local ou HTTPS de produção não dependa de cabeçalhos enviados pelo visitante. Acesse o host configurado, normalmente `localhost`, para os formulários e o login.

A autorização exige simultaneamente provedor Google, e-mail verificado e presença na lista privada. A sessão é reavaliada no backend, inclusive em uploads e mutações. Remover um e-mail da lista e reiniciar o servidor revoga o acesso dessa identidade. A primeira entrada autorizada pode criar sua conta, sem abrir cadastro público.

## E2E reproduzível

Sem Node nem browsers no host:

```sh
./scripts/test-e2e.sh
```

O script cria um projeto Compose `flora-e2e-*`, PostgreSQL em tmpfs, uploads e sessões de teste próprios. Constrói o mesmo target de produção, aplica migrations e seeds determinísticos e executa testes unitários, contratos OAuth simulados e Playwright em Chromium, Firefox, WebKit, Android e iPhone. Ao final reinicia a aplicação para verificar persistência dos rascunhos e remove somente os recursos daquela execução. Não carrega `.env.local`.

Artefatos em `.e2e/artifacts/report`, `.e2e/artifacts/results` e `.e2e/artifacts/services.log`. Relatório interativo:

```sh
npm exec playwright -- show-report .e2e/artifacts/report
```

Execução menor para diagnosticar cenários (não substitui a suíte completa):

```sh
./scripts/test-e2e.sh npm run test:e2e:run -- --project=chromium
```

`E2E_KEEP_STACK=1` preserva o projeto de teste para investigação; o script imprime seu nome. A limpeza continua restrita ao projeto com esse nome. Os diretórios de artefatos são ignorados pelo Git porque podem conter cookies e dados dos formulários fictícios.

O WhatsApp é interceptado antes da navegação externa. Os contratos OAuth usam chaves RSA e respostas Google inteiramente fictícias; a aplicação HTTP não contém endpoint de login de teste. Emulação mobile cobre layout e fluxos, e não substitui uma conferência pontual de teclado/câmera e abertura do WhatsApp no aparelho real.

## Organização

- `src/routes`: páginas SSR e ações de formulários; endpoints de saúde, upload e mídia.
- `src/lib/server`: acesso ao banco, autenticação, autorização, DTOs públicos e processamento de imagens.
- `src/lib/components`: catálogo, formulário WhatsApp, editor, uploader e componentes shadcn.
- `src/lib/domain.ts`: dinheiro em centavos, horário de Brasília e mensagem WhatsApp.
- `drizzle`: migrations SQL versionadas. Gere mudanças com `npm exec drizzle-kit -- generate` e revise o SQL antes de aplicar.
- `scripts`: migrations, seeds, inicialização do servidor e orquestração de testes.
- `tests`: regras de domínio, contratos OAuth e fluxos E2E.
- `static/brand` e `design/branding`: artes aprovadas; `static/demo-loja/attributions.json` registra as fotos da loja usadas na demonstração; `static/demo/attributions.json` registra as imagens ilustrativas e fixtures E2E.

Produto e variação têm relação 1:N. A primeira versão edita a variação padrão. Mídias têm tipo e ordenação para permitir vídeos posteriormente. Preço privado é removido no DTO público, antes do SSR ou da serialização. A mensagem WhatsApp usa os valores lidos no servidor no momento do envio. Produtos escondidos, rascunhos e excluídos retornam 404 público; imagens reais associadas também exigem produto publicado ou sessão autorizada.

Fotos aceitam JPEG, PNG, WebP e HEIC/HEIF, até 15 MB, com limite de pixels no processamento principal. São rotacionadas conforme a orientação, reduzidas a 1800 px e convertidas em WebP, sem EXIF. O upload tem progresso, reenvio, escolha de capa e ordem. Fotos enviadas e depois abandonadas sem salvar ficam órfãs no armazenamento; uma rotina de limpeza poderá ser acrescentada antes de operação prolongada.

Os resultados conferidos e os limites dessa validação estão em [docs/validacao-local.md](docs/validacao-local.md).

A escala de tipografia do celular, referências de e-commerce consultadas e verificações de ampliação estão em [docs/tipografia-mobile.md](docs/tipografia-mobile.md).

## Estado e publicação

O Raspberry usa Docker ARM64, PostgreSQL persistente e releases enviadas por SSH. Veja [deploy/README.md](deploy/README.md) para instalação, acesso por túnel ou rede local e recuperação da imagem anterior.

A prévia para testes está em [https://flordecacau.ddns.net](https://flordecacau.ddns.net), com produtos demonstrativos, Caddy e certificado Let's Encrypt automático. O admin exige uma conta Google presente na lista privada de acesso.

```sh
./deploy.sh update   # testa um snapshot, envia e atualiza o serviço
./deploy.sh status
./deploy.sh logs-https
./deploy.sh restart
./deploy.sh rollback
```

Para configurar HTTPS em um hostname público, use `./deploy.sh https flordecacau.ddns.net`. As portas TCP 80/443 devem chegar ao Raspberry, e o DNS precisa acompanhar mudanças do IP público. O No-IP gratuito exige confirmação periódica do hostname. A publicação está descrita em `docs/implantacao.md`; backups permanecem fora do escopo, conforme combinado. Dados e fotografias definitivos dependem da proprietária.

A auditoria de dependências tem avisos de baixa severidade ligados ao `deepmerge`, ainda sem correção publicada. O esbuild transitivo foi atualizado via override; não use `npm audit fix --force`, que propõe downgrades incompatíveis. Detalhes em `docs/dependencias.md`.
