<script lang="ts">
  import { enhance } from '$app/forms';
  import { untrack, onMount } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Save from '@lucide/svelte/icons/save';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import MediaUploader from './MediaUploader.svelte';
  import { availabilityLabels } from '#lib/domain';
  import type { Product } from '#lib/server/catalog';
  let {
    product,
    categories,
    form,
    saved = false
  }: {
    product: Product | null;
    categories: { id: string; name: string }[];
    form?: { error?: string; success?: string } | null;
    saved?: boolean;
  } = $props();
  let fields = $state(
    untrack(() => ({
      name: product?.name ?? '',
      description: product?.description ?? '',
      price:
        product?.variant.priceCents != null
          ? (product.variant.priceCents / 100).toFixed(2).replace('.', ',')
          : '',
      sku: product?.variant.sku ?? '',
      publication: product?.publication ?? 'draft',
      availability: product?.variant.availability ?? 'available',
      featured: product?.featured ?? false,
      categoryIds: product?.categories.map((c) => c.id) ?? []
    }))
  );
  let showPrice = $state(untrack(() => product?.variant.showPrice ?? true));
  let uploading = $state(false);
  let saving = $state(false);
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
</script>

<a class="back-link" href="/admin"><ArrowLeft size={16} />Voltar aos produtos</a>
<div class="admin-heading">
  <div>
    <h1>{product ? 'Cuidar deste produto' : 'Um novo carinho no catálogo'}</h1>
    <p>Fotos bonitas e detalhes claros ajudam o cliente a escolher.</p>
  </div>
  {#if product?.publication === 'published'}<a
      class="text-link"
      href={`/produtos/${product.slug}`}
      target="_blank"
      rel="noreferrer">Ver no site<ExternalLink size={16} /></a
    >{/if}
</div>
<form
  method="POST"
  class="editor-form"
  use:enhance={() => {
    saving = true;
    return async ({ update }) => {
      await update({ reset: false });
      saving = false;
    };
  }}
>
  {#if form?.error}<p class="form-error" role="alert">
      {form.error}
    </p>{/if}{#if form?.success || saved}<p class="success" role="status">
      {form?.success || 'Produto criado com carinho.'}
    </p>{/if}
  <fieldset class="editor-fields" disabled={!ready}>
    <legend class="sr-only">Informações para edição</legend>
    <div class="editor-columns">
      <div>
        <section class="form-panel">
          <h2>Os detalhes</h2>
          <label for="product-name">Nome do produto</label><input
            id="product-name"
            name="name"
            required
            minlength="2"
            maxlength="180"
            bind:value={fields.name}
          /><label for="description">Descrição</label><textarea
            id="description"
            name="description"
            rows="5"
            maxlength="6000"
            placeholder="Conte sobre as flores, o tamanho e os detalhes especiais…"
            bind:value={fields.description}></textarea>
          <div class="field-pair">
            <div>
              <label for="price">Preço (R$)</label><input
                id="price"
                name="price"
                inputmode="decimal"
                placeholder="129,90"
                bind:value={fields.price}
              />
            </div>
            <div>
              <label for="sku">Referência</label><input
                id="sku"
                name="sku"
                maxlength="80"
                bind:value={fields.sku}
                placeholder="Gerada automaticamente"
              />
            </div>
          </div>
          <label class="check-row"
            ><input type="checkbox" name="showPrice" bind:checked={showPrice} />Exibir preço no
            catálogo</label
          >{#if !showPrice}<p class="field-hint">
              O cliente verá “Preço sob consulta”. O valor informado fica privado.
            </p>{/if}
        </section>
        <section class="form-panel">
          <h2>Fotos que encantam</h2>
          <MediaUploader initial={product?.images ?? []} bind:busy={uploading} />
        </section>
      </div>
      <aside>
        <section class="form-panel">
          <h2>No catálogo</h2>
          <label for="publication">Visibilidade</label><select
            name="publication"
            id="publication"
            bind:value={fields.publication}
            ><option value="draft">Rascunho</option><option value="published"
              >Publicado no catálogo</option
            ><option value="hidden">Escondido</option></select
          >
          <p class="field-hint">Rascunhos e produtos escondidos não abrem por link direto.</p>
          <label for="availability">Disponibilidade</label><select
            id="availability"
            name="availability"
            bind:value={fields.availability}
            >{#each Object.entries(availabilityLabels) as [value, label]}<option {value}
                >{label}</option
              >{/each}</select
          ><label class="check-row"
            ><input type="checkbox" name="featured" bind:checked={fields.featured} />Destacar na
            página inicial</label
          >
        </section>
        <section class="form-panel">
          <h2>Categorias</h2>
          {#each categories as category}<label class="check-row"
              ><input
                type="checkbox"
                name="categoryIds"
                value={category.id}
                bind:group={fields.categoryIds}
              />{category.name}</label
            >{/each}<a href="/admin/categorias" class="text-link">Gerenciar categorias</a>
        </section>
      </aside>
    </div>
    <div class="editor-save">
      <p>
        {uploading
          ? 'Aguarde o envio das fotos ou remova as que falharam.'
          : 'Tudo pronto? Salve para atualizar o catálogo.'}
      </p>
      <button class="button button-green" disabled={uploading || saving}
        ><Save size={18} />{saving ? 'Salvando…' : 'Salvar produto'}</button
      >
    </div>
  </fieldset>
</form>
