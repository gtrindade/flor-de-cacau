<script lang="ts">
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import { money, availabilityLabels, type Availability } from '#lib/domain';
  import type { Product } from '#lib/server/catalog';
  let { product }: { product: Product } = $props();
</script>

<article class="product-card" data-testid="product-card">
  <a href={`/produtos/${product.slug}`} class="product-photo" aria-label={`Ver ${product.name}`}>
    {#if product.images[0]}<img
        src={product.images[0].url}
        alt={product.images[0].alt}
        loading="lazy"
        width="600"
        height="750"
      />{:else}<div class="photo-placeholder">Flor de Cacau</div>{/if}
    {#if product.variant.availability !== 'available'}<span class="photo-badge"
        >{availabilityLabels[product.variant.availability as Availability]}</span
      >{/if}
    <span class="photo-arrow"><ArrowUpRight size={19} /></span>
  </a>
  <div class="product-meta">
    <span class="product-category">{product.categories[0]?.name ?? 'Feito com carinho'}</span><a
      href={`/produtos/${product.slug}`}><h3>{product.name}</h3></a
    >
    <p class="product-price">
      {product.variant.priceCents !== null ? money(product.variant.priceCents) : 'Consulte o valor'}
    </p>
  </div>
</article>
