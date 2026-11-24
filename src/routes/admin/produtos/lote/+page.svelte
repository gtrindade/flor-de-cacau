<script lang="ts">
  import BatchProductEditor from '#lib/components/BatchProductEditor.svelte';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
</script>

<svelte:head><title>Cadastro em lote · Administração</title></svelte:head>
<BatchProductEditor categories={data.categories} {form} />
