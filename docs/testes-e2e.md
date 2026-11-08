# Estratégia de testes E2E — Flor de Cacau

Requisito acrescentado pelo usuário em 4 de novembro de 2026 para reduzir testes manuais em atualizações e deploys. Faz parte da primeira versão.

O ambiente, a aplicação, os seeds e os testes executáveis estão implementados no repositório. Este documento registra a estratégia de cobertura; o relatório de cada execução é a evidência do resultado.

## Objetivo e comando de entrada

Permitir que um ambiente com Docker e Compose execute a validação completa sem instalar Node, PostgreSQL ou navegadores diretamente no host e sem fornecer credenciais reais do Google ou do WhatsApp.

Comando disponível:

```sh
./scripts/test-e2e.sh
```

O comando completo é o padrão para validação de uma atualização. Filtros por navegador ou cenário poderão ser usados durante o desenvolvimento, mas não substituirão a suíte obrigatória de publicação.

## Serviços e ciclo de execução

| Componente | Responsabilidade                                                                                                  |
| ---------- | ----------------------------------------------------------------------------------------------------------------- |
| `db`       | PostgreSQL de teste, com dados descartáveis e healthcheck.                                                        |
| `init`     | Aplicar as migrations reais e carregar seeds/fixtures exclusivamente de teste.                                    |
| `app`      | Servidor SvelteKit produzido pelo build usado para implantação, conectado ao banco e aos uploads do ambiente E2E. |
| `e2e`      | Playwright Test, browsers e dependências, com relatórios exportados para o host.                                  |

O fluxo do script é:

1. Criar um projeto Compose exclusivo para aquela execução.
2. Construir as imagens necessárias e iniciar o banco, aguardando seu healthcheck.
3. Executar migrations e seeds em tarefa de duração finita, abortando em caso de falha.
4. Iniciar a aplicação e aguardar sua prontidão HTTP e de acesso ao banco.
5. Rodar a suíte e coletar relatórios, logs e traces.
6. Encerrar os recursos descartáveis daquela execução, preservando os artefatos e o resultado do teste no código de saída.

A conclusão do serviço de preparação é tratada como etapa esperada, sem encerrar antecipadamente a aplicação e os testes. A orquestração aguarda tarefas concluídas e serviços saudáveis explicitamente, em vez de usar esperas fixas.

## Isolamento e repetibilidade

- Arquivo Compose de E2E e projeto próprios, sem reutilizar volumes, redes ou banco de produção.
- Configuração fictícia própria de testes; a execução não carregará `.env.local` nem e-mails administrativos reais.
- Código de limpeza limitado aos recursos criados para aquela execução.
- Limpeza também após falha ou interrupção, com relatórios mantidos fora dos volumes descartáveis.
- Migrations usadas na produção aplicadas em um banco inicialmente vazio.
- Seed determinístico, com identificadores estáveis para leitura e entidades próprias para cada teste que altera dados.
- Asserções independentes de preços, horários ou conteúdo obtidos pela internet.
- Configurações globais mutáveis, como horário e cartão, terão restauração entre casos e execução sem concorrência incompatível.
- Inicialmente, priorizar um worker e execução sequencial dos cenários que compartilham estado. Aumentar paralelismo somente com isolamento correspondente de dados e arquivos.
- Usar a aplicação e o PostgreSQL reais; não substituir respostas internas do app para aparentar que CRUD, autorização ou persistência funcionam.

## Seeds e fixtures

Os dados iniciais de teste incluirão:

- Categorias da floricultura e um produto relacionado a mais de uma categoria.
- Produtos disponíveis, sob encomenda, sob consulta, indisponíveis, ocultos e em rascunho. Indisponíveis permanecem visíveis sem pedido; tentativas diretas de solicitar retornam 409. Sob consulta continua permitindo abrir o formulário e preparar a conversa.
- Alinhamento dos campos de busca e espaço entre lupa e texto, nos perfis desktop e mobile.
- Leitura mobile: texto visível com pelo menos 14 px, campos com pelo menos 16 px, acesso administrativo em 18 px e área de toque de pelo menos 44 px. Exercitar também 320 px com texto ampliado em 200% e paisagem nos perfis com toque, verificando ausência de rolagem horizontal em catálogo, pedido e painel.
- Produto com preço público e produto com um preço interno conhecido que não pode aparecer nos dados públicos.
- Uma variação padrão por produto, com referências distintas.
- Galeria de fotos com capa e ordem conhecidas.
- Dados públicos fictícios e horários determinísticos.
- Configuração de cartão desativado, com preparação específica para os cenários de cartão gratuito e pago.
- Identidade administrativa fictícia autorizada e identidades/sessões apropriadas para os testes negativos.
- Fotos locais de formatos aceitos, orientação retrato/paisagem e arquivos inválidos para validar rejeições.

Arquivos enviados pelos testes serão armazenados somente no volume de uploads do ambiente E2E. Os testes de exclusão criarão seus próprios produtos antes de removê-los.

## Autenticação e integrações externas

### Administração

Usar o Test Utils do Better Auth em uma configuração exclusiva de suporte aos testes para criar usuários e sessões reais no banco de teste e preparar os cookies do navegador. A aplicação continuará validando sessão e autorização normalmente.

Os helpers de suporte não fazem parte da configuração de autenticação de produção e não são expostos por uma rota HTTP de login alternativo. Fixtures/cookies de teste são gerados e usados somente dentro do ambiente E2E. O estado autenticado não será versionado.

A suíte cobrirá visitantes anônimos, administrador permitido, sessão expirada/inválida e identidade autenticada sem autorização, incluindo tentativas de alteração pelas rotas do servidor.

### Google

- Verificar pela interface a entrada de login e a saída de sessão.
- Cobrir o contrato OAuth e os caminhos de autorização/erro com respostas controladas do provedor nos testes de integração da autenticação.
- Não depender da página real de login do Google, de senha, de consentimento interativo ou de CAPTCHA durante a suíte automática.
- Não considerar uma sessão preparada por fixture como prova de que o consentimento real e os callbacks cadastrados no Google estão corretos.
- Validar o fluxo real como smoke test na configuração inicial do OAuth e quando domínio, callbacks ou credenciais mudarem.

### WhatsApp e localização

- Interceptar o WhatsApp no contexto do navegador, incluindo a primeira requisição de novas abas; verificar destinatário, mensagem e preservação da aba original.
- Conferir links do cabeçalho, rodapé e biografia, bloqueio de pop-up com link manual e fechamento da aba temporária após validação inválida ou falha de rede.
- Cobrir acentos, caracteres especiais, data, período, modalidade, localização de entrega, observação, referência e cartão.
- Validar endereço completo apenas para entrega: CEP com ou sem hífen, UF válida, número ou “s/n”, complemento e referência opcionais, preservação após erro e troca de modalidade, espaçamento dos campos e ausência de rolagem horizontal no diálogo mobile.
- Buscar pelo SKU recebido no WhatsApp, incluindo caixa diferente, categoria incompatível e referências de produtos ocultos/rascunhos que não podem aparecer no catálogo público.
- Verificar links de localização da loja.
- Não enviar mensagens nem depender do conteúdo de páginas externas.

## Matriz mínima de cobertura

| Área                   | Cenários obrigatórios                                                                                                                                                |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Catálogo               | Home, destaques, categorias, busca, resultado vazio e associação de um produto a múltiplas categorias.                                                               |
| Produto                | Detalhes, galeria, imagem de capa, navegação entre imagens, preço público e estados de disponibilidade.                                                              |
| Preço privado          | Valor interno ausente do HTML inicial, dos dados públicos retornados e da mensagem do WhatsApp.                                                                      |
| Links inválidos        | Produto inexistente, oculto e excluído retornam HTTP 404; retorno à página inicial funciona.                                                                         |
| Solicitação            | Data conhecida/desconhecida, horário/período ou a combinar, retirada/entrega, campos condicionais, observações e validações.                                         |
| Cartão                 | Desativado, não selecionado, selecionado, mensagem, adicional gratuito/pago e subtotal quando aplicável.                                                             |
| Horários               | Dentro/fora do atendimento, limites de abertura/fechamento, dia fechado e diferença entre fuso do visitante e da floricultura; aviso permite continuar.              |
| Autorização            | Acesso anônimo negado ao admin e às mutações; conta autorizada aceita; identidade não autorizada e sessões inválidas rejeitadas.                                     |
| Produtos no admin      | Criar, salvar rascunho, editar preço/descrição, alternar preço público, mudar disponibilidade, destacar, ocultar, republicar e excluir com cancelamento/confirmação. |
| Categorias no admin    | Criar, editar, associar e desassociar categorias, preservando o único cadastro do produto.                                                                           |
| Imagens no admin       | Seleção múltipla, upload real, prévia, capa, ordem, remoção, rejeição de arquivo inválido e recuperação após falha sem perder os demais campos.                      |
| Conteúdo da loja       | Editar biografia, formatação, imagem opcional, dados públicos e horários; refletir alterações na página pública.                                                     |
| Configuração comercial | Alterar a oferta/preço do cartão e o texto sobre entregas; verificar efeitos no fluxo público.                                                                       |
| Mobile                 | Percorrer catálogo e concluir solicitação; cadastrar/editar produto com upload, controles por toque e campos utilizáveis em tela estreita.                           |
| Persistência           | Alterações continuam disponíveis após reiniciar a aplicação usando o mesmo banco/volume de testes.                                                                   |

“Todas as funcionalidades” significa rastrear cada requisito funcional para cenários positivos e negativos relevantes. Não significa testar exaustivamente toda combinação possível de dados, navegadores e dispositivos.

## Tempo, navegadores e recursos

- Controlar o relógio do navegador e a fonte de horário usada pelo servidor nos testes de atendimento. Alterar apenas o relógio do browser não valida horários calculados pelo SSR.
- Evitar dependência da data real da execução, tanto no formulário quanto nas regras de atendimento.
- Projetos para Chromium, Firefox e WebKit no desktop, além de perfis representativos de Android e iPhone.
- Perfis mobile emulados não substituem verificações pontuais de câmera, seletor de arquivos, teclado virtual e abertura de apps no aparelho real.
- A suíte deve poder ser executada no Mac com Docker ou em CI. A execução no Raspberry, se usada, terá projeto e recursos próprios, sem depender dos dados dos serviços de produção.
- Validar as imagens e browsers disponíveis para as arquiteturas alvo na implementação; fixar versões compatíveis do pacote Playwright e da imagem com navegadores.

## Relatórios e critério de liberação

- Gerar relatório HTML e resultado legível pela CI.
- Guardar screenshots de falhas, traces e logs suficientes para reproduzir o problema.
- Usar seletores por papel/rótulo e identificadores estáveis quando necessário.
- Preferir auto-wait e asserções do Playwright a pausas arbitrárias.
- Repetição/retry, quando habilitada, será limitada e casos instáveis ficarão visíveis no relatório.
- Falhas de build, migration, seed ou cenários obrigatórios reprovam a execução.
- Antes de liberar atualização, exigir a suíte obrigatória aprovada para a revisão/artefato correspondente.
- Após deploy, executar verificações curtas e não destrutivas de saúde/HTTPS. Operações destrutivas e seeds ficam restritos ao ambiente descartável.

## Estrutura implementada

```text
compose.e2e.yaml
playwright.config.ts
scripts/test-e2e.sh
tests/e2e/
tests/integration/
tests/unit/
.e2e/artifacts/report/   # relatório HTML ignorado pelo Git
.e2e/artifacts/results/  # screenshots, vídeos e traces de falhas
```

## Referências

- [Playwright em Docker](https://playwright.dev/docs/docker).
- [Setup por dependências de projetos](https://playwright.dev/docs/test-global-setup-teardown).
- [Estado autenticado no Playwright](https://playwright.dev/docs/auth).
- [Boas práticas e dependências externas](https://playwright.dev/docs/best-practices).
- [Better Auth Test Utils](https://better-auth.com/docs/plugins/test-utils).
- [Prontidão e ordem de inicialização no Compose](https://docs.docker.com/compose/how-tos/startup-order/).
