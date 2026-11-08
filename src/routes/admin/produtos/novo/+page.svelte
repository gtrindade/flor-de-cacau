<script lang="ts">
  import ProductEditor from '#lib/components/ProductEditor.svelte';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Novo produto · Administração</title></svelte:head>
<ProductEditor product={data.product} categories={data.categories} {form} />
