# Dependências e avisos conhecidos

Versões diretas fixadas e lockfile versionado. Node 24 LTS no build e runtime; imagem Playwright e pacote `@playwright/test` na mesma versão 1.64.1. Revalidar a suíte ao atualizar dependências.

Na implementação local, `npm audit` indicou oito avisos de baixa severidade derivados de `deepmerge`, usado transitivamente por ferramentas e bibliotecas do stack. O advisory [GHSA-gcqx-w48m-w2h4](https://github.com/advisories/GHSA-gcqx-w48m-w2h4) não lista versão corrigida. A aplicação valida entradas com schemas e não passa objetos arbitrários de formulários para mesclagem de opções de autenticação/configuração. Isso não elimina a necessidade de acompanhar a correção da dependência.

O aviso moderado no esbuild transitivo do Drizzle foi removido com override para 0.28.2. A geração de migrations continua funcionando e foi verificada com o override. O [advisory do esbuild](https://github.com/advisories/GHSA-67mh-4wv8-2f99) refere-se ao servidor de desenvolvimento de versões até 0.24.2.

`npm audit fix --force` sugeriu versões muito antigas e incompatíveis de SvelteKit/Better Auth/Drizzle; essa alteração não foi aplicada. O estado acima deve ser revisto antes da publicação e em cada atualização de dependências.
