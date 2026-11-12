# Flor de Cacau — requisitos

Estado atualizado em 4 de novembro de 2026, a partir da conversa com o desenvolvedor.
O usuário aprovou os requisitos. A implementação local está disponível; este documento registra os requisitos aprovados. Dados de publicação que dependem da proprietária estão identificados no final.

## Objetivo

Criar um catálogo público da Floricultura Flor de Cacau, em Sabará, com administração pela proprietária e pelo desenvolvedor. Clientes conhecem os produtos e iniciam solicitações pelo WhatsApp. Disponibilidade final, retirada ou entrega e pagamento são combinados na conversa.

## Decisões confirmadas para a primeira versão

### Tecnologia e hospedagem

- SvelteKit, com TypeScript no frontend e no backend, executando em Node.
- Renderização no servidor para as páginas públicas dos produtos.
- Componentes shadcn-svelte e estilos com Tailwind.
- PostgreSQL como banco de dados.
- Hospedagem pretendida no Raspberry Pi 5 do desenvolvedor, em sua casa.
- Domínio próprio e certificado HTTPS válido, com Let's Encrypt como opção aceita.
- Preferência para o domínio: preço baixo e nome fácil de falar e digitar; extensão flexível. `flordecacausabara.com.br` foi escolhido como referência provisória. A escolha final e a compra serão decididas pelo desenvolvedor com sua mãe; nenhum domínio foi registrado. Pesquisa em `docs/dominios.md`.
- Acesso SSH por chave já verificado. O projeto usará o usuário existente do servidor.

### Acesso e administração

- Catálogo e solicitações pelo WhatsApp acessíveis sem login.
- Login administrativo com Google.
- Inicialmente, apenas a conta Google do desenvolvedor será autorizada, identificada em configuração privada. A conta da proprietária será acrescentada quando ela escolher o e-mail que deseja usar.
- Cadastro público de usuários fora da primeira versão.
- Permissão de administrador atribuída explicitamente no backend.
- Administração responsiva, permitindo cadastrar produtos inteiramente pelo celular.

### Catálogo e categorias

- Estimativa inicial de 10 a 50 produtos.
- Categorias configuráveis pela administradora.
- Um produto pode pertencer a várias categorias, mantendo um único cadastro de suas variações, preços, disponibilidade e mídias.
- A relação entre produtos e categorias é muitos para muitos; alterar uma associação não duplica nem exclui o produto.
- Categorias iniciais: Buquês, Arranjos, Flores, Cestas e Presentes.
- Busca por nome e navegação por categoria.
- Produtos em destaque na página inicial, selecionados no admin.
- Galeria com várias fotos, imagem de capa e ordem configurável.

### Produtos e variações

- Modelar a relação Produto → Variações como um para muitos.
- Dois modos por produto: galeria com um preço único, ou uma opção por foto com preço próprio. O modo por foto aceita seleção em lote sem limite de quantidade; o limite de 15 MB continua valendo por imagem.
- Ao selecionar fotos no segundo modo, apresentar imediatamente campos de preço associados a cada prévia, preservando essa associação mesmo quando os uploads terminarem fora de ordem. Disponibilidade, exibição do preço, nome e referência são editáveis por opção.
- Cada opção tem identificação estável. Reordenar fotos ou editar preços não altera referências nem links já enviados. Converter uma galeria existente preserva sua referência na primeira opção.
- O catálogo mostra um único produto e, ao abri-lo, permite escolher a foto/opção. O link direto identifica a opção por `?opcao=<id>`. Uma opção removida ou pertencente a outro produto retorna 404.
- Produto concentra nome, descrição, categorias, fotos, URL e visibilidade.
- Variação concentra referência, nome da opção, preço, exibição do preço e disponibilidade.
- Preparar evolução para opções como buquês de 6, 12 ou 24 rosas, com valores próprios.
- Quantidade livre de rosas com cálculo de preço não faz parte desta primeira versão.
- Permitir preço cadastrado internamente e anúncio público sem preço, com chamada para consultar pelo WhatsApp.
- Preços ocultos não devem ser enviados nos dados públicos da página.
- Disponibilidade manual: disponível, sob encomenda, consultar disponibilidade ou indisponível.

### Visibilidade e exclusão

- Marcar como indisponível: manter o produto público apenas para visualização, com indicação de indisponibilidade, sem iniciar pedido. O status separado “consultar disponibilidade” permite contato sobre o produto.
- Esconder: preservar o produto no admin e permitir publicá-lo novamente depois.
- Excluir permanentemente: remover o produto e suas variações, com confirmação identificando o produto.
- Visibilidade do produto e disponibilidade da variação são independentes.
- Link público de produto oculto, excluído ou inexistente retorna HTTP 404.
- A página de erro usa a identidade visual e oferece um link claro para voltar à página inicial.
- Produtos ocultos continuam acessíveis aos administradores pelo painel.

### Solicitação pelo WhatsApp

- Botão no produto abre um formulário curto antes de encaminhar ao WhatsApp.
- Informações previstas: produto e referência, data desejada ou “Ainda não sei”, período/horário ou “A combinar”, retirada ou entrega e observação opcional.
- Para entrega, coletar CEP, rua/avenida, número (aceitando “s/n”), bairro, cidade e UF. Complemento e ponto de referência são opcionais. Os campos aparecem apenas para entrega, preservam os valores ao alternar a modalidade e são validados no servidor. A mensagem do WhatsApp inclui o endereço completo; retirada não inclui endereço.
- Todos os links e solicitações abrem o WhatsApp em nova aba, preservando a aba do site. A mensagem vem preenchida e o cliente ainda precisa enviá-la. Se o navegador bloquear a abertura automática, oferecer um link manual para a conversa validada, também em nova aba.
- A mensagem inclui a referência da variação e o preço público quando houver. No modo por foto, inclui também o nome da opção e um link direto para ela.
- A busca do catálogo aceita nome e referência da variação (SKU), sem diferenciar maiúsculas de minúsculas, mantendo o filtro por categoria e a visibilidade pública dos produtos.
- Data e horário são preferências, sujeitos a confirmação na conversa.
- Datas e horários de atendimento usam o fuso da floricultura, em Sabará, independentemente do fuso do servidor ou do visitante.
- Horários semanais editáveis no admin para a primeira versão.
- Mostrar aviso quando a solicitação for iniciada fora do horário de atendimento, mantendo o fluxo disponível.
- O aviso sobre o atendimento atual não estabelece a disponibilidade da data solicitada para retirada ou entrega.
- Não há carrinho, cobrança automática ou confirmação automática de pedido.

### Cartão com mensagem

- Um único tipo de cartão na primeira versão.
- Opção de adicionar ou não o cartão à solicitação.
- Campo para escrever a mensagem quando selecionado.
- Adicional de preço configurável no admin, inclusive gratuito quando esse for o valor cadastrado.
- Exibir separadamente o adicional do cartão e o subtotal estimado quando o preço do produto for público.
- Produto sob consulta não recebe um total fictício.
- Incluir a opção e a mensagem do cartão no texto do WhatsApp.
- Valor real e prática comercial do cartão ainda serão confirmados com a proprietária.
- A oferta do cartão começa desativada e poderá ser ativada no admin após a configuração de seu preço. Preço não informado não significa cartão gratuito.

### Experiência mobile e imagens

- Celular é um dispositivo principal tanto para clientes quanto para a administradora.
- A proprietária usa Android, provavelmente Samsung e Chrome; o modelo ainda é desconhecido e não impede o planejamento.
- Compatibilidade alvo: Chrome e Samsung Internet no Android, Safari no iPhone/iPad e Chrome, Edge, Firefox e Safari no computador.
- Upload direto da galeria do telefone, com seleção de várias fotos e prévia.
- Captura pela câmera pode ser oferecida quando suportada, mantendo a galeria como alternativa.
- Otimização automática das imagens para exibição na web.
- Critérios de aceite: controles confortáveis para toque, formulários legíveis, uso com teclado aberto, progresso de upload, tentativa de reenvio e preservação dos campos em caso de erro.
- Salvamento como rascunho para permitir concluir cadastros depois.
- Modelar uma galeria de mídias separada do produto, com tipo e ordem, permitindo acrescentar vídeos posteriormente.

### Conteúdo e identidade visual

- Página inicial com apresentação breve, categorias, produtos destacados, endereço, horários, WhatsApp e link de localização no Maps.
- Seção “Sobre a Flor de Cacau” editável pelo admin, com título e texto livre.
- Formatação básica de texto e foto opcional da proprietária ou da loja nessa seção.
- Logo simplificado v1 aprovado.
- Fundo floral v1 aprovado.
- Referências e arquivos em `design/branding/`.
- Cores de referência: verde escuro, amarelo, rosa e fundo marfim.

Texto inicial proposto para a seção sobre a floricultura:

> Na Flor de Cacau, flores e presentes ajudam a transformar carinho em gestos especiais. Em Sabará, oferecemos buquês, arranjos e cestas para celebrar, agradecer ou surpreender alguém.
>
> Cada pedido começa com uma conversa. Pelo WhatsApp, ajudamos você a escolher uma opção para a ocasião e combinamos os detalhes com atenção e cuidado.

### Testes automatizados E2E

- Playwright Test em TypeScript como parte da primeira versão.
- Ambiente inteiramente em Docker, incluindo aplicação, PostgreSQL, preparação de dados e navegadores de teste.
- Banco, rede e uploads de testes isolados dos ambientes de desenvolvimento e produção.
- Seeds determinísticos com dados fictícios, cobrindo todos os estados relevantes de produtos, categorias, mídias, configurações e usuários.
- Um comando prepara o ambiente, aplica migrations, carrega os seeds, executa a suíte e encerra os recursos descartáveis, preservando os relatórios.
- Cobertura dos fluxos públicos e administrativos definidos neste documento, incluindo falhas, validações, autorização e estados de indisponibilidade.
- Execução nos motores Chromium, Firefox e WebKit, com projetos para desktop e perfis mobile representativos.
- Relatório HTML, logs, screenshots e traces de falhas para diagnóstico.
- Integrações externas controladas nos testes: sessões fictícias do Better Auth para o admin, respostas simuladas para os contratos OAuth e verificação do link/mensagem do WhatsApp sem enviar mensagens reais.
- O fluxo real de consentimento do Google e a abertura do aplicativo WhatsApp em aparelhos reais terão verificações pontuais quando suas configurações mudarem.
- Suíte obrigatória antes de liberar uma atualização para deploy, associada à revisão do código testado.
- Estratégia e matriz de cobertura em `docs/testes-e2e.md`.

## Decisões técnicas para implementação

- `adapter-node` para gerar o servidor SvelteKit de produção.
- Better Auth para login Google e sessões, com lista de e-mails autorizados na configuração privada.
- Drizzle para acesso ao PostgreSQL e migrations.
- Zod para validar entradas no servidor.
- TypeScript com modo estrito e checagem de tipos obrigatória antes do deploy.
- Docker Compose para empacotar e operar aplicação e banco.
- Caddy como proxy reverso e gerenciador de certificado.
- Atualização dinâmica do DNS caso o IP público mude.
- Arquivos de mídia em armazenamento persistente, com metadados no PostgreSQL.
- Configuração e operação de backups fora do escopo deste projeto, por decisão do usuário. O desenvolvedor usará sua solução de backup e fará sua configuração manualmente.
- Fluxo de solicitação sem persistência do conteúdo do formulário na primeira versão. Histórico de solicitações ou pedidos fica para avaliação futura.
- Entrega anunciada como “sob consulta”, com endereço completo na solicitação e taxas combinadas pelo WhatsApp. Região de atendimento poderá ser descrita em texto editável no admin, quando confirmada.
- Plano operacional em `docs/implantacao.md`.
- Ambiente E2E dedicado em Docker Compose, com Playwright e seeds de teste.

## Ambiente observado

Consultas por SSH, somente leitura, realizadas nesta conversa; arquitetura, disco e portas conferidos novamente em 4 de novembro de 2026:

- Debian GNU/Linux 13.4, arquitetura `aarch64`.
- Aproximadamente 8 GiB de RAM e armazenamento NVMe de aproximadamente 2 TB.
- Pasta compartilhada Flora corresponde a `/home/trindade/workspace/flor-de-cacau` no servidor.
- Portas 80 e 443 sem serviços escutando localmente na consulta realizada; o encaminhamento externo ainda não foi verificado.
- Node, npm, Docker e `psql` não foram encontrados no PATH da sessão consultada; isso não é uma auditoria completa de instalações existentes.
- Há outros serviços no equipamento, incluindo Foundry VTT. A implantação deverá respeitar esses serviços.

## Fase 2 ou avaliações futuras

- Cadastro público de clientes e funcionalidades associadas, ainda a definir.
- Avaliar outros provedores de login, como Facebook. Google é o único escolhido para a primeira versão.
- Upload, tratamento e exibição de vídeos.
- Importação dos horários do Google Maps/Perfil da Empresa.
- Variações sem associação individual a uma foto e combinações de atributos como tamanho e cor.

## Pontos ainda abertos

### Pendências de requisitos resolvidas

- Dados públicos de `docs/dados-publicacao.md` confirmados pelo usuário em 4 de novembro de 2026.
- E-mail inicial do desenvolvedor informado e reservado à configuração privada de acesso. A escolha do e-mail da proprietária foi adiada pelo usuário e não impede o início com apenas um administrador.
- Backups retirados do escopo; configuração manual de responsabilidade do desenvolvedor.

### Atividades para a publicação

- Confirmar o domínio provisório com a proprietária e registrar o domínio escolhido, conforme decisão já tomada de adiar a compra.
- Criar/configurar as credenciais OAuth do Google e os endereços de retorno para desenvolvimento e produção.
- Configurar DNS, atualização dinâmica do IP, encaminhamento externo e HTTPS.
- Executar a suíte E2E completa e revisar seus resultados antes de publicar uma atualização.
- Preencher e revisar produtos e fotografias reais pelo admin.

O cartão pode permanecer desativado e a entrega pode permanecer sob consulta enquanto suas condições específicas não forem confirmadas. A escolha final do domínio e o conteúdo real do catálogo não impedem o desenvolvimento local.
