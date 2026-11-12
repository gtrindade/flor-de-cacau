<script lang="ts">
  import { enhance } from '$app/forms';
  import { untrack, onMount } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Save from '@lucide/svelte/icons/save';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import MediaUploader, { type UploadPhoto } from './MediaUploader.svelte';
  import { availabilityLabels, type Availability, type ProductMode } from '#lib/domain';
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
  let mode = $state<ProductMode>(
    untrack(() => (product?.mode === 'photo_variants' ? 'photo_variants' : 'standard'))
  );
  let photos = $state<UploadPhoto[]>(
    untrack(() => (product?.images ?? []).map((photo) => ({ ...photo, key: photo.id })))
  );
  type OptionFields = {
    id: string;
    name: string;
    sku: string;
    price: string;
    showPrice: boolean;
    availability: Availability;
  };
  let options = $state<Record<string, OptionFields>>({});
  $effect(() => {
    const current = photos.map((photo) => ({ key: photo.key, id: photo.id }));
    const savedOptions = product?.variants ?? [];
    untrack(() => {
      current.forEach((photo, index) => {
        const savedOption =
          savedOptions.find((option) => option.imageId === photo.id) ??
          (product?.mode === 'standard' && index === 0 ? product.variant : undefined);
        if (!options[photo.key])
          options[photo.key] = {
            id: product?.mode === 'photo_variants' ? (savedOption?.id ?? '') : '',
            name: product?.mode === 'photo_variants' ? (savedOption?.name ?? '') : '',
            sku: savedOption?.sku ?? '',
            price:
              savedOption?.priceCents != null
                ? (savedOption.priceCents / 100).toFixed(2).replace('.', ',')
                : '',
            showPrice: savedOption?.showPrice ?? true,
            availability: (savedOption?.availability ?? fields.availability) as Availability
          };
        else if (product?.mode === 'photo_variants' && savedOption) {
          options[photo.key]!.id ||= savedOption.id;
          options[photo.key]!.sku ||= savedOption.sku;
          options[photo.key]!.name ||= savedOption.name;
        }
      });
    });
  });
  function nextPrice(event: KeyboardEvent, index: number) {
    if (event.key !== 'Enter') return;
    event.preventDefault();
    const next = photos[index + 1];
    if (next) document.getElementById(`option-price-${next.key}`)?.focus();
  }
  function syncMode(next: ProductMode) {
    const first = photos[0] && options[photos[0].key];
    if (!first) return;
    if (next === 'photo_variants') {
      first.price = fields.price;
      first.sku = fields.sku;
      first.showPrice = showPrice;
      first.availability = fields.availability as Availability;
    } else {
      fields.price = first.price;
      fields.sku = first.sku;
      showPrice = first.showPrice;
      fields.availability = first.availability;
    }
  }
  let uploading = $state(false);
  let saving = $state(false);
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
</script>

{#snippet photoDetails(photo: UploadPhoto, index: number)}
  {#if options[photo.key]}
    {@const option = options[photo.key]!}
    <div class="photo-option-fields">
      <h3>{option.name || `Opção ${index + 1}`}</h3>
      <p class="field-hint">{option.sku || 'Referência gerada ao salvar'}</p>
      <label for={`option-price-${photo.key}`}>Preço (R$)</label>
      <input
        id={`option-price-${photo.key}`}
        data-option-price
        inputmode="decimal"
        enterkeyhint="next"
        placeholder="129,90"
        bind:value={option.price}
        maxlength="40"
        required={fields.publication === 'published' && option.showPrice}
        onkeydown={(event) => nextPrice(event, index)}
      />
      <label for={`option-availability-${photo.key}`}>Disponibilidade da opção</label>
      <select id={`option-availability-${photo.key}`} bind:value={option.availability}>
        {#each Object.entries(availabilityLabels) as [value, label]}<option {value}>{label}</option
          >{/each}
      </select>
      <details>
        <summary>Identificação e exibição do preço</summary>
        <label for={`option-name-${photo.key}`}>Nome da opção</label>
        <input
          id={`option-name-${photo.key}`}
          bind:value={option.name}
          maxlength="180"
          placeholder={`Opção ${index + 1}`}
        />
        <label for={`option-sku-${photo.key}`}>Referência da opção</label>
        <input
          id={`option-sku-${photo.key}`}
          bind:value={option.sku}
          maxlength="80"
          placeholder="Gerada automaticamente"
        />
        <label class="check-row"
          ><input type="checkbox" bind:checked={option.showPrice} />Exibir preço desta opção</label
        >
        {#if !option.showPrice}<p class="field-hint">
            O valor fica privado. O cliente poderá consultá-lo pelo WhatsApp.
          </p>{/if}
      </details>
    </div>
  {/if}
{/snippet}

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
    <fieldset class="product-mode-picker">
      <legend>Como deseja cadastrar as fotos?</legend>
      <label class:chosen={mode === 'standard'}>
        <input
          type="radio"
          name="mode"
          value="standard"
          bind:group={mode}
          aria-label="Um preço para o produto"
          onchange={() => syncMode('standard')}
          disabled={photos.length > 8 ||
            (product?.mode === 'photo_variants' && product.variants.length > 1)}
        />
        <span
          ><strong>Um preço para o produto</strong><small>Várias fotos do mesmo produto.</small
          ></span
        >
      </label>
      <label class:chosen={mode === 'photo_variants'}>
        <input
          type="radio"
          name="mode"
          value="photo_variants"
          bind:group={mode}
          aria-label="Um preço por foto"
          onchange={() => syncMode('photo_variants')}
        />
        <span
          ><strong>Um preço por foto</strong><small
            >Cada foto é uma opção para o cliente escolher.</small
          ></span
        >
      </label>
    </fieldset>
    {#if mode === 'photo_variants'}
      <input
        type="hidden"
        name="variants"
        value={JSON.stringify(
          photos.map((photo) => ({ ...options[photo.key], imageId: photo.id }))
        )}
      />
    {/if}
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
          {#if mode === 'standard'}<div class="field-pair">
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
              </p>{/if}{:else}<p class="field-hint">
              Adicione todas as fotos abaixo e informe um preço em cada opção. A referência será
              gerada automaticamente.
            </p>{/if}
        </section>
        <section class="form-panel">
          <h2>Fotos que encantam</h2>
          <MediaUploader
            bind:photos
            bind:busy={uploading}
            max={mode === 'photo_variants' ? null : 8}
            details={mode === 'photo_variants' ? photoDetails : undefined}
          />
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
          {#if mode === 'standard'}<label for="availability">Disponibilidade</label><select
              id="availability"
              name="availability"
              bind:value={fields.availability}
              >{#each Object.entries(availabilityLabels) as [value, label]}<option {value}
                  >{label}</option
                >{/each}</select
            >{:else}<p class="field-hint">
              A disponibilidade é definida em cada foto. Uma opção indisponível continua visível,
              mas não aceita pedidos.
            </p>{/if}<label class="check-row"
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
