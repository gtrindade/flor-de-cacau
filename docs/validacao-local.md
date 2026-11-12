# Validação da aplicação e implantação

A suíte completa foi executada novamente em 12 de novembro de 2026, pelo snapshot de implantação `20261112T130852Z-64309`. A mesma release foi publicada no Raspberry e conferida por SSH e HTTPS público. A aplicação usa Node 24.22.2 e PostgreSQL 18; o Raspberry executa as imagens nativas ARM64.

| Verificação                                             | Resultado                                                                                    |
| ------------------------------------------------------- | -------------------------------------------------------------------------------------------- |
| TypeScript e Svelte, incluindo scripts e testes         | 0 erros, 0 avisos                                                                            |
| Build de produção com adapter-node                      | Aprovado no Mac e no Raspberry ARM64                                                         |
| Testes unitários de domínio, autorização e CLI          | 13 aprovados                                                                                 |
| Contratos Google OAuth e ID token com provedor simulado | 6 aprovados                                                                                  |
| E2E Chromium, Firefox, WebKit, Android e iPhone         | 135 aprovados, sem retries                                                                   |
| Testes dos scripts de implantação, incluindo HTTPS      | 10 aprovados                                                                                 |
| Reinício da aplicação no ambiente E2E                   | 5 rascunhos criados pela interface preservados                                               |
| Limpeza do ambiente E2E                                 | Containers, rede e volumes descartáveis removidos                                            |
| Runtime Sharp no Raspberry                              | Conversão WebP executada em ARM64                                                            |
| Atualização no Raspberry                                | Sete produtos, sete variações e 22 mídias preservados; hashes dos dados anteriores idênticos |
| Aplicação e PostgreSQL no Raspberry                     | Saudáveis                                                                                    |

A execução completa usou `./deploy.sh update`, que chama `scripts/test-e2e.sh` sobre um snapshot imutável. Os 135 cenários Playwright concluíram em aproximadamente 8,5 minutos, além de build, preparação, testes unitários/integração e verificação após reinício. Os testes de implantação usam `python3 -m unittest discover -s tests/deploy -p 'test_*.py'`.

O relatório HTML está em `.e2e/artifacts/report/index.html`; screenshots em `.e2e/artifacts/results`; logs dos serviços em `.e2e/artifacts/services.log`; saída da execução em `.e2e/artifacts/execution.log`. Esses artefatos são locais e ignorados pelo Git. Os registros da primeira atualização, rollback e reinício do Raspberry estão em `.local/deploy-logs`.

Foram exercitados catálogo, busca por nome/referência e filtros, preços privados, 404, pedidos e cartões, endereço completo, aviso de horário, validação de entrada, autorização, CRUD de produtos e categorias, uploads reais com reenvio, ordenação e remoção, formatação da biografia, configurações e saída da sessão. Os testes também rejeitam erros JavaScript inesperados na página. A busca preserva texto digitado antes da hidratação.

O modo de preço por foto foi exercitado nos cinco perfis com dez imagens: preenchimento durante o upload, fila de duas requisições, conclusão fora da ordem de seleção, preços e referências próprios, conversão de galeria preservando a referência original e edição/reordenação mantendo os IDs. Os cenários verificam o link direto e a mensagem da opção escolhida, busca pela referência exata, preço oculto, opção indisponível, exclusão com 404 e rejeição de vínculos de outra opção/produto sem salvar alterações parciais. Android e iPhone também conferem o editor em 320 px com texto ampliado em 200%. Screenshots `editor-preco-por-foto.png` e `opcoes-por-foto.png` registram a revisão visual.

A primeira execução encontrou uma limitação de `route.fetch` ao reproduzir uploads multipart no WebKit: os arquivos eram reenviados vazios pela interceptação. O teste passou a atrasar e encaminhar a requisição nativa, preservando os bytes das fotos. Safari, Android e iPhone passaram no cenário isolado e a execução completa seguinte aprovou os 135 cenários. A execução reprovada não foi enviada ao servidor.

Todos os caminhos para WhatsApp foram conferidos em nova aba, preservando a aba original: pedido, cabeçalho, rodapé e links da biografia. A suíte cobre o link manual quando o navegador bloqueia a abertura automática, fechamento da aba temporária após erro e preservação dos campos para tentar novamente. As navegações ao WhatsApp são interceptadas; nenhuma mensagem real é enviada pelos testes.

O formulário de entrega coleta CEP, rua/avenida, número, bairro, cidade e UF, com complemento e ponto de referência opcionais. Foram conferidos formato do CEP, UF válida, “s/n”, preservação após erro/troca de modalidade e mensagem completa. Retirada não inclui endereço. A revisão visual mantém espaçamento compacto, rótulos alinhados à borda esquerda dos campos e chevrons com recuo à direita. Produtos indisponíveis continuam públicos apenas para visualização; solicitar diretamente retorna HTTP 409.

A prévia no Raspberry está em `https://flordecacau.ddns.net`, com certificado Let's Encrypt válido e redirecionamento HTTP para HTTPS. Saúde, páginas públicas e busca por `FC-LOJA-002` foram conferidas por HTTPS público com a validação normal de certificados. Uma solicitação gerou o redirecionamento 303 do SvelteKit, sem seguir o link ao WhatsApp; a mensagem contém a referência e o link HTTPS do produto. Uma origem estrangeira foi rejeitada com HTTP 403. O certificado emitido corresponde ao hostname e vence em 6 de fevereiro de 2027; o Caddy mantém a renovação automática. `/admin` sem sessão retorna 303 para `/entrar`.

A release ativa conferida no servidor é `20261112T130852Z-64309`, publicada após a aprovação dos 135 E2E. A anterior é `20261108T181357Z-50582`. A migration aditiva `0001_photo_variants` foi aplicada, mantendo os sete produtos existentes em preço único. Contagens e hashes dos dados anteriores à migration foram comparados antes/depois: sete produtos, sete variações e 22 mídias idênticos, desconsiderando somente as novas colunas. O seed não sobrescreveu conteúdo. Saúde e catálogo retornaram 200 por HTTPS, a busca por referência funcionou, `/admin` anônimo redirecionou para login e produto inexistente retornou 404.

Atualização, rollback e reinício anteriores foram conferidos em 8 de novembro. A configuração privada mantém permissão 600 e o PostgreSQL não publica porta no host. O Docker está habilitado no boot e os containers usam `restart: unless-stopped`; não foi necessário reiniciar fisicamente o Raspberry. Foundry VTT permanece na porta 30000. Depois de usar o modo por foto, uma recuperação deve escolher release que entenda esse modo, conforme [deploy/README.md](../deploy/README.md).

Os produtos da prévia usam fotos da própria loja e valores/disponibilidade fictícios, identificados na interface. As imagens ilustrativas da página inicial e as fixtures E2E continuam separadas. O ambiente local no Mac preserva seus 12 produtos.

Em 8 de novembro, Caddy/HTTPS e a origem pública foram configurados. O cliente OAuth preserva localhost e inclui o novo callback HTTPS. As duas contas administrativas estão também nos usuários de teste do Google; o início do login foi conferido até a seleção de conta, sem concluir autenticação em nome dos usuários. O painel permanece protegido. Os contratos OAuth usam contas e respostas fictícias; o consentimento e o retorno autenticado reais ainda exigem uma conferência pelos usuários. Perfis mobile são emulados. A configuração de backups permanece fora do escopo; os volumes estão identificados em [deploy/README.md](../deploy/README.md).

Os botões de WhatsApp usam agora os glyphs oficiais de 2026, obtidos no pacote público da Meta, sem alterações em desenho ou cores. O componente preserva os rótulos acessíveis, e os testes de nova aba passaram nos cinco perfis. Origem dos ativos em `static/brand/whatsapp-attribution.md`.

A revisão de leitura mobile usa textos principais de 18 px, controles de pelo menos 16 px e textos auxiliares de pelo menos 14 px. O link “Administração” passou de 8 para 18 px, com área de toque maior que 44 px. Foram conferidos rodapé, catálogo, pedido, login e painel em 390 px, reflow em 320 px com texto ampliado em 200% e paisagem nos perfis com toque. Os novos cenários passaram em Chromium, Firefox, WebKit, Android e iPhone; fontes usam rem e os campos se reorganizam sem rolagem horizontal. Referências em [tipografia-mobile.md](tipografia-mobile.md).

Após a publicação, o navegador confirmou na URL HTTPS, em viewport de 390 px: corpo e link “Administração” em 18 px, link com altura de aproximadamente 50,8 px e nenhuma rolagem horizontal. Captura local em `.e2e/artifacts/rodape-mobile-publicado.jpg`. O ambiente Docker local também foi reconstruído com a versão final.
