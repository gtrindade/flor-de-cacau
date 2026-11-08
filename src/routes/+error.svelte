<script lang="ts">
  import { page } from '$app/state';
  import Flower2 from '@lucide/svelte/icons/flower-2';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
</script>

<svelte:head
  ><title
    >{page.status === 404 ? 'Página não encontrada' : 'Não foi possível carregar'} · Flor de Cacau</title
  ><meta name="robots" content="noindex" /></svelte:head
>
<div class="container error-page">
  <Flower2 size={64} strokeWidth={1} />
  <p class="eyebrow">{page.status}</p>
  <h1>{page.status === 404 ? 'Essa flor não está por aqui.' : 'Um instante, por favor.'}</h1>
  <p>
    {page.status === 404
      ? 'Não encontramos a página que você procura.'
      : 'Não conseguimos carregar a página agora. Tente novamente em instantes.'}
  </p>
  <a href="/" class="button button-green"><ArrowLeft size={17} />Voltar para a página inicial</a>
</div>
