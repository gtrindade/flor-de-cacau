# Leitura no celular

A revisão de 8 de novembro de 2026 aumenta a tipografia do catálogo e do painel administrativo. O link “Administração” tinha 8 px no celular; preços tinham 11 px e vários textos auxiliares, entre 7 e 10 px.

| Elemento                                           | Tamanho padrão no celular                |
| -------------------------------------------------- | ---------------------------------------- |
| Descrições, biografia, endereço e preços dos cards | 18 px                                    |
| Botões, navegação, filtros, rótulos e horários     | Pelo menos 16 px                         |
| Referências, categorias, dicas e avisos auxiliares | Pelo menos 14 px                         |
| Acesso “Administração” no rodapé                   | 18 px, com área de toque maior que 44 px |

Os tamanhos usam `rem`, acompanhando a preferência de texto do navegador. O rodapé usa uma coluna; filtros, campos e cards se reorganizam quando falta espaço. O painel usa navegação em duas colunas e ações maiores. A mesma escala se aplica a dispositivos de toque em paisagem até 1100 px. Textos secundários e placeholders também receberam maior contraste.

## Referências consultadas

- [Isabela Flores](https://www.isabelaflores.com/): inspeção em viewport de 390 px encontrou nomes e preços de produtos em 15 px e links institucionais em 13 px.
- [Dawn, tema oficial da Shopify](https://github.com/Shopify/dawn/blob/main/layout/theme.liquid): corpo em `1.5rem` no mobile e `1.6rem` a partir de 750 px, sobre raiz proporcional a 62,5% na escala padrão; equivale a 15 e 16 px com fonte padrão de 16 px. [Botões do tema](https://github.com/Shopify/dawn/blob/main/assets/base.css) usam `1.5rem`.
- [Shopify: boas práticas de acessibilidade](https://shopify.dev/docs/storefronts/themes/best-practices/accessibility).
- [W3C: reflow](https://www.w3.org/WAI/WCAG22/Understanding/reflow.html): conteúdo precisa continuar utilizável quando ampliado e em telas estreitas.

A escala da Flora é maior que as referências consultadas para favorecer a leitura da proprietária e dos clientes.

## Verificação

Playwright verifica o texto efetivamente renderizado, campos, tamanho do acesso administrativo e ausência de rolagem horizontal no catálogo, pedido, login e painel. Também exercita tela de 320 px com a raiz tipográfica ampliada em 200% e paisagem nos perfis com toque. Os cenários usam exclusivamente o banco E2E descartável.
