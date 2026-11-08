<script lang="ts">
  import Search from '@lucide/svelte/icons/search';
  import Flower2 from '@lucide/svelte/icons/flower-2';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import ProductCard from '#lib/components/ProductCard.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  let query = $derived(data.query);
  let category = $derived(data.category);
</script>

<svelte:head
  ><title>Nosso catálogo · Flor de Cacau</title><meta
    name="description"
    content="Encontre buquês, arranjos, flores, cestas e presentes. Escolha seu carinho e combine os detalhes pelo WhatsApp."
  /></svelte:head
>
<section class="catalog-intro container">
  <p class="breadcrumb"><a href="/">Início</a><span>/</span>Nosso catálogo</p>
  <p class="eyebrow">FLORES, PRESENTES E BONS SENTIMENTOS</p>
  <h1>Todo carinho tem <em>seu jeito.</em></h1>
  <p>
    Encontre uma opção que combine com o momento.<br />A gente conversa sobre os detalhes pelo
    WhatsApp.
  </p>
</section>
<section class="container catalog-content">
  <form method="GET" class="search-form">
    <div class="search-field">
      <Search size={19} /><input
        id="catalog-search"
        name="q"
        aria-label="Buscar produtos por nome ou referência"
        placeholder="Nome do produto ou referência"
        bind:value={query}
      />
    </div>
    <select name="categoria" aria-label="Filtrar por categoria" bind:value={category}
      ><option value="">Todas as categorias</option>{#each data.categories as category}<option
          value={category.slug}>{category.name}</option
        >{/each}</select
    ><button class="button button-green" type="submit">Buscar <ArrowRight size={16} /></button>
  </form>
  <div class="catalog-chips">
    <a class:active={!data.category} href={`/catalogo?q=${encodeURIComponent(data.query)}`}>Todos</a
    >{#each data.categories as c}<a
        class:active={data.category === c.slug}
        href={`/catalogo?categoria=${c.slug}&q=${encodeURIComponent(data.query)}`}>{c.name}</a
      >{/each}
  </div>
  <p class="result-count">
    {data.products.length}
    {data.products.length === 1 ? 'opção encontrada' : 'opções encontradas'}
  </p>
  {#if data.products.length}<div class="product-grid">
      {#each data.products as product}<ProductCard {product} />{/each}
    </div>{:else}<div class="empty-state">
      <Flower2 size={42} strokeWidth={1} />
      <h2>Nenhum produto por aqui.</h2>
      <p>Tente outra palavra ou explore todas as categorias.</p>
      <a href="/catalogo" class="button button-green">Ver todo o catálogo</a>
    </div>{/if}
</section>
