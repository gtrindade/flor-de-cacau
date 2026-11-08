# Plano de implantação — Flor de Cacau

Serviço instalado em 7 de novembro de 2026 no Raspberry Pi 5, com Docker Engine, Compose, aplicação ARM64 e PostgreSQL persistente. Em 8 de novembro de 2026, a prévia passou a usar `https://flordecacau.ddns.net`, com Caddy e certificado Let's Encrypt válido. Os seis produtos demonstrativos foram preservados. O admin permanece restrito às contas Google configuradas em particular; o novo callback HTTPS foi salvo e o início do login chegou à seleção de conta.

Os comandos de instalação, atualização, logs, reinício e rollback estão em [deploy/README.md](../deploy/README.md). A execução do Docker no boot foi habilitada. Foundry VTT permanece na porta 30000.

## Aplicação e serviços

- SvelteKit e TypeScript, com SSR e `adapter-node`.
- Better Auth para login Google, Drizzle para PostgreSQL e Zod para validação de entradas.
- TypeScript em modo estrito, com checagem explícita antes do build/deploy.
- Docker Compose executa aplicação e PostgreSQL no Raspberry. Caddy roda em um projeto Compose separado, com certificados persistentes e acesso ao app pela rede Docker interna.
- Dependências e imagens compatíveis com Linux ARM64, com versões fixadas na implementação.
- Aplicação e banco com reinício automático após reinicialização do servidor.
- Credenciais e demais configurações privadas em arquivos ignorados pelo Git.
- Ambiente de testes E2E separado, inteiramente em Docker, conforme `docs/testes-e2e.md`.

O servidor de páginas acessa o banco diretamente pelo código de servidor da aplicação. Rotas administrativas e operações de alteração verificam a sessão e a autorização no backend.

## Acesso administrativo

- Apenas Google como provedor inicial.
- Inicialmente, somente a identidade Google do desenvolvedor pode ter acesso administrativo. A identidade da proprietária será acrescentada após a escolha de seu e-mail.
- Usar a identidade validada pelo provedor, com e-mail verificado, para vincular as contas previamente autorizadas.
- A permissão de administrador é explícita e verificada no servidor.
- Cadastro público de usuários desativado.
- Os e-mails permitidos e os segredos OAuth não serão colocados nos documentos públicos do projeto.

As credenciais OAuth serão configuradas para localhost no desenvolvimento e para o domínio HTTPS definitivo na produção. A autorização do Perfil da Empresa do Google fica fora desta fase.

## Implantação e persistência

- Checkout/configuração de implantação no diretório já identificado: `/home/trindade/workspace/flor-de-cacau`.
- Dados do PostgreSQL, uploads e estado do Caddy em armazenamento persistente separado dos arquivos substituídos pelo build.
- Construir o artefato para Linux ARM64; não transportar `node_modules` do Mac para o servidor.
- Aplicar migrations de forma controlada. A configuração e a operação de backups são responsabilidade do desenvolvedor, em sua solução independente.
- Manter referência da imagem anterior para recuperação da aplicação caso uma atualização falhe.

Banco e uploads não são substituídos por uma atualização normal. Os volumes são `flor-de-cacau-server_database` e `flor-de-cacau-server_uploads`. Releases ficam em `releases/<id>`; configuração privada em `shared/.env`; os links `current` e `previous` identificam as versões ativa e anterior.

## Rede, domínio e HTTPS

- Hostname de testes: `flordecacau.ddns.net`, registrado pelo usuário no No-IP. O domínio próprio será escolhido posteriormente.
- URL pública configurável por ambiente.
- Caddy recebe o tráfego HTTP/HTTPS e encaminha as requisições para o SvelteKit na rede interna dos serviços.
- PostgreSQL restrito à rede interna dos serviços.
- Se o IP público mudar, atualizar os registros DNS pelo mecanismo disponível no provedor escolhido.
- Conferir encaminhamento das portas 80/443 no roteador e sua acessibilidade externa quando formos publicar.
- Configurar emissão e renovação automática do certificado.
- Adequar domínio, origem pública da aplicação e callbacks do Google em conjunto.

O Caddy foi instalado em 8 de novembro nas portas 80/443, após o encaminhamento configurado pelo usuário. O HTTPS público foi validado com a confiança normal de certificados. A porta 5180 da aplicação foi restrita ao loopback do Raspberry. O atualizador DDNS ainda deve ser conferido para incluir o novo hostname; o plano gratuito exige confirmação a cada 30 dias. Foundry VTT continua na porta 30000; seu encaminhamento e execução são independentes deste projeto.

## Backups e recuperação

O usuário informou que já possui uma solução de backup e fará sua configuração manualmente. Configuração, agendamento, transferência, retenção e validação de backups ficam fora do escopo do projeto.

Os locais de persistência do PostgreSQL e das mídias serão identificados na configuração de implantação para permitir a integração com a solução independente do usuário.

## Conteúdo inicial e operação

- Produtos e fotos reais serão cadastrados/revisados pelo painel antes de publicar o catálogo.
- Dados públicos confirmados pelo usuário em 4 de novembro de 2026 e configuráveis pelo admin.
- Entrega inicialmente anunciada como “sob consulta”, sem cálculo automático de taxa.
- Cartão desativado até que a proprietária defina a oferta e o adicional.
- Solicitações seguem para o WhatsApp sem armazenar o conteúdo do formulário no site nesta fase.

## Validação antes de publicar

- Executar Playwright com migrations e seeds em ambiente descartável; o processo deve retornar código diferente de zero se ocorrer falha de preparação, de build ou de teste.
- Relacionar o resultado aprovado à revisão/artefato da aplicação que será publicado. Mudanças posteriores exigem nova execução dos testes afetados e da suíte obrigatória.
- Catálogo anônimo, busca, categorias e galeria responsivos.
- Produto oculto/excluído retorna HTTP 404 com retorno para a página inicial.
- Preços privados ausentes do HTML e dos dados públicos.
- Mensagem do WhatsApp correta, incluindo cartão quando ativado e selecionado.
- Aviso fora do horário calculado no fuso da floricultura e sem bloquear o fluxo.
- Login Google e operações administrativas restritos às contas permitidas.
- Cadastro completo com fotos pelo celular e tratamento de falha de upload.
- Persistência após reinicialização e atualização da aplicação.

## Referências técnicas

- [SvelteKit: servidor Node](https://svelte.dev/docs/kit/adapter-node).
- [Better Auth: integração SvelteKit](https://better-auth.com/docs/integrations/svelte-kit).
- [Better Auth: adaptador Drizzle](https://better-auth.com/docs/adapters/drizzle).
- [Docker Compose em produção](https://docs.docker.com/compose/how-tos/production/).
- [Caddy: HTTPS automático](https://caddyserver.com/docs/automatic-https).
- [Estratégia E2E do projeto](testes-e2e.md).
