<script lang="ts">
  import ProductEditor from '#lib/components/ProductEditor.svelte';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Editar {data.product.name} · Administração</title></svelte:head>
{#key data.product.id}<ProductEditor
    product={data.product}
    categories={data.categories}
    {form}
    saved={data.saved}
  />{/key}
