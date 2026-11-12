<script lang="ts">
  import { enhance } from '$app/forms';
  import FormFeedback from '#lib/components/FormFeedback.svelte';
  import Plus from '@lucide/svelte/icons/plus';
  import Pencil from '@lucide/svelte/icons/pencil';
  import EyeOff from '@lucide/svelte/icons/eye-off';
  import Eye from '@lucide/svelte/icons/eye';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import { money, productPriceLabel, availabilityLabels, type Availability } from '#lib/domain';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let deleting = $state<string | null>(null);
  const labels: Record<string, string> = {
    published: 'No catálogo',
    draft: 'Rascunho',
    hidden: 'Escondido'
  };
</script>

<svelte:head><title>Produtos · Administração</title></svelte:head>
<div class="admin-heading">
  <div>
    <h1>Seu catálogo</h1>
    <p>{data.products.length} produtos · Um carinho para cada ocasião.</p>
  </div>
  <a class="button button-green" href="/admin/produtos/novo"><Plus size={18} />Novo produto</a>
</div>
<FormFeedback {form} />
<div class="admin-products">
  {#each data.products as product}<article class="admin-product" data-testid="admin-product">
      <div class="admin-product-image">
        {#if product.images[0]}<img src={product.images[0].url} alt="" />{:else}<span>Sem foto</span
          >{/if}
      </div>
      <div class="admin-product-info">
        <span class="pill" class:published={product.publication === 'published'}
          >{labels[product.publication]}</span
        >
        <h2>{product.name}</h2>
        <p>
          {#if product.mode === 'photo_variants'}{product.variants.length} opções · {productPriceLabel(
              product
            )}{:else}{product.variant.priceCents !== null
              ? money(product.variant.priceCents)
              : 'Sem preço'}{!product.variant.showPrice ? ' · Preço oculto' : ''}{/if}
        </p>
        <span class="field-hint"
          >{product.mode === 'photo_variants'
            ? 'Preço e disponibilidade por opção'
            : availabilityLabels[product.variant.availability as Availability]}</span
        >
      </div>
      <div class="admin-product-actions">
        <a class="button button-outline button-small" href={`/admin/produtos/${product.id}`}
          ><Pencil size={15} />Editar</a
        >
        <form method="POST" action="?/visibility" use:enhance>
          <input type="hidden" name="id" value={product.id} /><input
            type="hidden"
            name="publication"
            value={product.publication === 'published' ? 'hidden' : 'published'}
          /><button
            class="icon-button"
            aria-label={product.publication === 'published'
              ? `Esconder ${product.name}`
              : `Publicar ${product.name}`}
            title={product.publication === 'published' ? 'Esconder' : 'Publicar'}
            >{#if product.publication === 'published'}<EyeOff size={18} />{:else}<Eye
                size={18}
              />{/if}</button
          >
        </form>
        <button
          class="icon-button danger"
          aria-label={`Excluir ${product.name}`}
          onclick={() => (deleting = deleting === product.id ? null : product.id)}
          ><Trash2 size={18} /></button
        >
      </div>
      {#if deleting === product.id}<form
          class="delete-confirm"
          method="POST"
          action="?/delete"
          use:enhance={() =>
            async ({ update }) => {
              await update();
              deleting = null;
            }}
        >
          <p>Essa exclusão é permanente. Para confirmar, digite <strong>{product.name}</strong>.</p>
          <input type="hidden" name="id" value={product.id} /><label for={`delete-${product.id}`}
            >Nome do produto para confirmar</label
          ><input id={`delete-${product.id}`} name="confirmation" required autocomplete="off" />
          <div class="form-actions">
            <button class="button button-danger">Excluir permanentemente</button><button
              type="button"
              class="button button-outline"
              onclick={() => (deleting = null)}>Cancelar</button
            >
          </div>
        </form>{/if}
    </article>{/each}
</div>
{#if !data.products.length}<div class="empty-state">
    <h2>Seu primeiro produto começa aqui.</h2>
    <a href="/admin/produtos/novo" class="button button-green">Cadastrar produto</a>
  </div>{/if}
