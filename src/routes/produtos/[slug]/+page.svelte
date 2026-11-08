<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Heart from '@lucide/svelte/icons/heart';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Check from '@lucide/svelte/icons/check';
  import { money, availabilityLabels, type Availability } from '#lib/domain';
  import OrderForm from '#lib/components/OrderForm.svelte';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let selected = $state(0);
  $effect(() => {
    data.product.id;
    selected = 0;
  });
</script>

<svelte:head
  ><title>{data.product.name} · Flor de Cacau</title><meta
    name="description"
    content={data.product.description.slice(0, 155)}
  /><link rel="canonical" href={data.canonicalURL} /><meta
    property="og:url"
    content={data.canonicalURL}
  /><meta property="og:title" content={`${data.product.name} · Flor de Cacau`} /><meta
    property="og:description"
    content={data.product.description.slice(0, 155)}
  />{#if data.product.images[0]}<meta
      property="og:image"
      content={new URL(data.product.images[0].url, data.canonicalURL).href}
    />{/if}</svelte:head
>
<div class="container product-detail">
  <p class="breadcrumb">
    <a href="/">Início</a><span>/</span><a href="/catalogo">Catálogo</a><span>/</span>{data.product
      .name}
  </p>
  <div class="detail-grid">
    <section class="gallery" aria-label="Fotos do produto">
      <div class="gallery-main">
        {#if data.product.images[selected]}<img
            src={data.product.images[selected]!.url}
            alt={data.product.images[selected]!.alt}
            width="700"
            height="800"
          />{:else}<div class="photo-placeholder">Flor de Cacau</div>{/if}
      </div>
      {#if data.product.images.length > 1}<div class="gallery-thumbs">
          {#each data.product.images as image, i}<button
              onclick={() => (selected = i)}
              aria-label={`Ver foto ${i + 1}`}
              aria-pressed={selected === i}><img src={image.url} alt="" /></button
            >{/each}
        </div>{/if}
    </section>
    <section class="detail-copy">
      <a href="/catalogo" class="back-link"><ArrowLeft size={16} />Voltar ao catálogo</a>
      <p class="eyebrow">{data.product.categories.map((c) => c.name).join(' · ')}</p>
      <h1>{data.product.name}</h1>
      <span class="availability" class:muted={data.product.variant.availability === 'unavailable'}
        >{#if data.product.variant.availability === 'available'}<Check
            size={14}
          />{/if}{availabilityLabels[data.product.variant.availability as Availability]}</span
      >
      <p class="detail-price">
        {data.product.variant.priceCents !== null
          ? money(data.product.variant.priceCents)
          : 'Valor sob consulta'}
      </p>
      <p class="detail-description">{data.product.description}</p>
      {#if data.product.variant.availability === 'unavailable'}
        <p class="notice unavailable-notice">Este produto está indisponível no momento.</p>
      {:else}
        <OrderForm product={data.product} settings={data.settings} {form} />
        <p class="order-explainer">
          <MessageCircle size={16} />A gente combina disponibilidade, entrega e pagamento na
          conversa.
        </p>
      {/if}
      <div class="detail-extra">
        <Heart size={20} strokeWidth={1.2} />
        <div>
          <strong>Do seu jeito, com carinho.</strong>
          <p>Conte a ocasião e suas preferências. Vamos encontrar os detalhes para esse momento.</p>
        </div>
      </div>
      <p class="sku">Referência: {data.product.variant.sku}</p>
    </section>
  </div>
</div>
