<script lang="ts">
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Heart from '@lucide/svelte/icons/heart';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Check from '@lucide/svelte/icons/check';
  import { money, availabilityLabels, productOptionPath, type Availability } from '#lib/domain';
  import OrderForm from '#lib/components/OrderForm.svelte';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let selected = $state(0);
  let activeVariant = $derived(data.selectedVariant ?? data.product.variant);
  let showingOptions = $derived(data.product.mode === 'photo_variants' && !data.selectedVariant);
  let displayImages = $derived(
    data.product.mode === 'photo_variants' && activeVariant.image
      ? [activeVariant.image]
      : data.product.images
  );
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
  />{#if displayImages[0]}<meta
      property="og:image"
      content={new URL(displayImages[0].url, data.canonicalURL).href}
    />{/if}</svelte:head
>
<div class="container product-detail">
  <p class="breadcrumb">
    <a href="/">Início</a><span>/</span><a href="/catalogo">Catálogo</a><span>/</span>{data.product
      .name}
  </p>
  {#if showingOptions}
    <section class="option-overview">
      <a href="/catalogo" class="back-link"><ArrowLeft size={16} />Voltar ao catálogo</a>
      <p class="eyebrow">{data.product.categories.map((category) => category.name).join(' · ')}</p>
      <h1>{data.product.name}</h1>
      <p class="detail-description">{data.product.description}</p>
      <p class="option-intro">Escolha uma opção para ver os detalhes e pedir pelo WhatsApp.</p>
      <div class="photo-options-grid">
        {#each data.product.variants as option (option.id)}
          <article class="photo-option-card" data-testid="photo-option">
            <a
              class="option-photo"
              href={productOptionPath(data.product.slug, option.id)}
              aria-label={`Ver ${option.name}, referência ${option.sku}`}
            >
              {#if option.image}<img
                  src={option.image.url}
                  alt={option.image.alt || option.name}
                  loading="lazy"
                  width="500"
                  height="600"
                />{:else}<div class="photo-placeholder">Flor de Cacau</div>{/if}
            </a>
            <div class="option-copy">
              <h2>{option.name}</h2>
              <p class="option-price">
                {option.priceCents !== null ? money(option.priceCents) : 'Valor sob consulta'}
              </p>
              <p class="availability" class:muted={option.availability === 'unavailable'}>
                {availabilityLabels[option.availability as Availability]}
              </p>
              <p class="sku">Referência: {option.sku}</p>
              <a
                class="button button-outline"
                href={productOptionPath(data.product.slug, option.id)}
                >{option.availability === 'unavailable' ? 'Ver opção' : 'Escolher esta opção'}</a
              >
            </div>
          </article>
        {/each}
      </div>
    </section>
  {:else}
    <div class="detail-grid">
      <section class="gallery" aria-label="Fotos do produto">
        <div class="gallery-main">
          {#if displayImages[selected]}<img
              src={displayImages[selected]!.url}
              alt={displayImages[selected]!.alt}
              width="700"
              height="800"
            />{:else}<div class="photo-placeholder">Flor de Cacau</div>{/if}
        </div>
        {#if displayImages.length > 1}<div class="gallery-thumbs">
            {#each displayImages as image, i}<button
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
        {#if data.product.mode === 'photo_variants'}
          <p class="selected-option-name">{activeVariant.name}</p>
          <a class="text-link" href={productOptionPath(data.product.slug)}>Ver todas as opções</a>
        {/if}
        <span class="availability" class:muted={activeVariant.availability === 'unavailable'}
          >{#if activeVariant.availability === 'available'}<Check
              size={14}
            />{/if}{availabilityLabels[activeVariant.availability as Availability]}</span
        >
        <p class="detail-price">
          {activeVariant.priceCents !== null
            ? money(activeVariant.priceCents)
            : 'Valor sob consulta'}
        </p>
        <p class="detail-description">{data.product.description}</p>
        {#if activeVariant.availability === 'unavailable'}
          <p class="notice unavailable-notice">Este produto está indisponível no momento.</p>
        {:else}
          {#key activeVariant.id}<OrderForm
              product={data.product}
              variant={activeVariant}
              settings={data.settings}
              {form}
            />{/key}
          <p class="order-explainer">
            <MessageCircle size={16} />A gente combina disponibilidade, entrega e pagamento na
            conversa.
          </p>
        {/if}
        <div class="detail-extra">
          <Heart size={20} strokeWidth={1.2} />
          <div>
            <strong>Do seu jeito, com carinho.</strong>
            <p>
              Conte a ocasião e suas preferências. Vamos encontrar os detalhes para esse momento.
            </p>
          </div>
        </div>
        <p class="sku">Referência: {activeVariant.sku}</p>
      </section>
    </div>
  {/if}
</div>
