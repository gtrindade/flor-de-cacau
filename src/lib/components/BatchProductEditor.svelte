<script lang="ts">
  import { enhance } from '$app/forms';
  import { onMount, untrack } from 'svelte';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import Save from '@lucide/svelte/icons/save';
  import MediaUploader, { type UploadPhoto } from './MediaUploader.svelte';
  import FormFeedback from './FormFeedback.svelte';
  import { availabilityLabels, type Availability } from '#lib/domain';
  let {
    categories,
    form
  }: { categories: { id: string; name: string }[]; form?: { error?: string } | null } = $props();
  let photos = $state<UploadPhoto[]>([]);
  type Fields = {
    name: string;
    description: string;
    price: string;
    availability: Availability;
    showPrice: boolean;
  };
  let entries = $state<Record<string, Fields>>({});
  let publication = $state('draft');
  let categoryIds = $state<string[]>([]);
  let uploading = $state(false);
  let saving = $state(false);
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
  $effect(() => {
    const current = photos.map((photo) => photo.key);
    untrack(() =>
      current.forEach((key, index) => {
        entries[key] ??= {
          name: `Opção ${index + 1}`,
          description: '',
          price: '',
          availability: 'available',
          showPrice: true
        };
      })
    );
  });
</script>

{#snippet productFields(photo: UploadPhoto, index: number)}
  {#if entries[photo.key]}
    {@const entry = entries[photo.key]!}
    <div class="photo-option-fields batch-product-fields">
      <h3>Produto {index + 1}</h3>
      <label for={`batch-name-${photo.key}`}>Nome do produto</label>
      <input
        id={`batch-name-${photo.key}`}
        bind:value={entry.name}
        maxlength="180"
        placeholder={`Opção ${index + 1}`}
      />
      <label for={`batch-price-${photo.key}`}>Preço (R$)</label>
      <input
        id={`batch-price-${photo.key}`}
        bind:value={entry.price}
        inputmode="decimal"
        placeholder="0,00"
        maxlength="40"
        required={publication === 'published' && entry.showPrice}
      />
      <label for={`batch-description-${photo.key}`}>Descrição (opcional)</label>
      <textarea
        id={`batch-description-${photo.key}`}
        bind:value={entry.description}
        rows="2"
        maxlength="6000"
        placeholder="Pode deixar para depois"></textarea>
      <label for={`batch-availability-${photo.key}`}>Disponibilidade</label>
      <select id={`batch-availability-${photo.key}`} bind:value={entry.availability}>
        {#each Object.entries(availabilityLabels) as [value, label]}<option {value}>{label}</option
          >{/each}
      </select>
      <label class="check-row"
        ><input type="checkbox" bind:checked={entry.showPrice} />Exibir preço no catálogo</label
      >
      {#if !entry.showPrice}<p class="field-hint">
          O cliente poderá consultar o valor pelo WhatsApp.
        </p>{/if}
    </div>
  {/if}
{/snippet}

<a class="back-link" href="/admin"><ArrowLeft size={16} />Voltar aos produtos</a>
<div class="admin-heading">
  <div>
    <h1>Cadastrar produtos em lote</h1>
    <p>Cada foto cria um produto separado. Preencha os preços e ajuste os nomes quando quiser.</p>
  </div>
</div>
<form
  method="POST"
  class="editor-form"
  use:enhance={() => {
    saving = true;
    return async ({ update }) => {
      try {
        await update({ reset: false });
      } finally {
        saving = false;
      }
    };
  }}
>
  <FormFeedback {form} />
  <fieldset class="editor-fields" disabled={!ready || saving}>
    <legend class="sr-only">Produtos do lote</legend>
    <input
      type="hidden"
      name="items"
      value={JSON.stringify(photos.map((photo) => ({ ...entries[photo.key], imageId: photo.id })))}
    />
    <div class="editor-columns">
      <section class="form-panel">
        <h2>Fotos e produtos</h2>
        <p class="batch-intro">
          Você pode adicionar mais fotos, reorganizar ou remover alguma antes de salvar. A descrição
          é opcional.
        </p>
        <MediaUploader
          bind:photos
          bind:busy={uploading}
          max={null}
          individualProducts
          details={productFields}
        />
      </section>
      <aside>
        <section class="form-panel">
          <h2>Para este lote</h2>
          <label for="batch-publication">Visibilidade dos produtos</label>
          <select id="batch-publication" name="publication" bind:value={publication}
            ><option value="draft">Salvar como rascunhos</option><option value="published"
              >Publicar no catálogo</option
            ><option value="hidden">Esconder do catálogo</option></select
          >
          <p class="field-hint">Depois de salvar, cada produto poderá ser editado separadamente.</p>
          <h3>Categorias</h3>
          {#each categories as category}<label class="check-row"
              ><input
                type="checkbox"
                name="categoryIds"
                value={category.id}
                bind:group={categoryIds}
              />{category.name}</label
            >{/each}
          <p class="field-hint">Estas categorias serão aplicadas aos produtos deste lote.</p>
        </section>
      </aside>
    </div>
    <div class="editor-save">
      <p>
        {uploading
          ? 'Aguarde o envio ou corrija as fotos que falharam.'
          : `${photos.length} produto${photos.length === 1 ? '' : 's'} neste lote.`}
      </p>
      <button class="button button-green" disabled={uploading || saving || !photos.length}
        ><Save size={18} />{saving ? 'Salvando…' : `Salvar ${photos.length} produtos`}</button
      >
    </div>
  </fieldset>
</form>
