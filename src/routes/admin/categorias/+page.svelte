<script lang="ts">
  import { enhance } from '$app/forms';
  import Plus from '@lucide/svelte/icons/plus';
  import Save from '@lucide/svelte/icons/save';
  import Trash2 from '@lucide/svelte/icons/trash-2';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let deleting = $state<string | null>(null);
</script>

<svelte:head><title>Categorias · Administração</title></svelte:head>
<div class="admin-heading">
  <div>
    <h1>Jeitos de presentear</h1>
    <p>Organize o catálogo com as categorias da loja.</p>
  </div>
</div>
{#if form?.error}<p class="form-error" role="alert">{form.error}</p>{/if}{#if form?.success}<p
    class="success"
    role="status"
  >
    {form.success}
  </p>{/if}
<section class="form-panel category-admin">
  <h2>Nova categoria</h2>
  <form method="POST" action="?/save" use:enhance class="inline-form">
    <div>
      <label for="new-category">Nome da nova categoria</label><input
        id="new-category"
        name="name"
        required
        minlength="2"
        maxlength="60"
        placeholder="Ex.: Orquídeas"
      />
    </div>
    <button class="button button-green"><Plus size={17} />Adicionar</button>
  </form>
</section>
<div class="category-admin-list">
  {#each data.categories as category}<section class="form-panel">
      <form method="POST" action="?/save" use:enhance class="inline-form">
        <input type="hidden" name="id" value={category.id} />
        <div>
          <label for={`cat-${category.id}`}>Nome da categoria</label><input
            id={`cat-${category.id}`}
            name="name"
            value={category.name}
            required
            minlength="2"
            maxlength="60"
          />
        </div>
        <button class="button button-outline" aria-label={`Salvar ${category.name}`}
          ><Save size={17} />Salvar</button
        ><button
          type="button"
          class="icon-button danger"
          aria-label={`Remover ${category.name}`}
          onclick={() => (deleting = deleting === category.id ? null : category.id)}
          ><Trash2 size={18} /></button
        >
      </form>
      {#if deleting === category.id}<form
          method="POST"
          action="?/delete"
          use:enhance
          class="delete-confirm"
        >
          <input type="hidden" name="id" value={category.id} /><label class="check-row"
            ><input type="checkbox" name="confirm" required />Remover esta categoria. Os produtos
            continuarão no catálogo.</label
          ><button class="button button-danger">Confirmar remoção</button>
        </form>{/if}
    </section>{/each}
</div>
