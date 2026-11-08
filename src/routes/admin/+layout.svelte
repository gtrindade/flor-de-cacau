<script lang="ts">
  import { createAuthClient } from 'better-auth/svelte';
  import { page } from '$app/state';
  import { goto } from '$app/navigation';
  import Flower2 from '@lucide/svelte/icons/flower-2';
  import Tags from '@lucide/svelte/icons/tags';
  import Settings from '@lucide/svelte/icons/settings';
  import LogOut from '@lucide/svelte/icons/log-out';
  import ExternalLink from '@lucide/svelte/icons/external-link';
  import type { LayoutProps } from './$types';
  let { data, children }: LayoutProps = $props();
  async function logout() {
    await createAuthClient().signOut();
    await goto('/entrar', { invalidateAll: true });
  }
</script>

<svelte:head><meta name="robots" content="noindex,nofollow" /></svelte:head>
<div class="container admin-shell">
  <div class="admin-topline">
    <div>
      <p class="eyebrow">ADMINISTRAÇÃO</p>
      <p>Olá, {data.user.name.split(' ')[0]}. Vamos cuidar da loja?</p>
    </div>
    <button class="text-link" onclick={logout}><LogOut size={16} />Sair</button>
  </div>
  <nav class="admin-nav" aria-label="Administração">
    <a
      href="/admin"
      class:active={page.url.pathname === '/admin' || page.url.pathname.includes('/produtos/')}
      ><Flower2 size={18} />Produtos</a
    ><a href="/admin/categorias" class:active={page.url.pathname.includes('/categorias')}
      ><Tags size={18} />Categorias</a
    ><a href="/admin/configuracoes" class:active={page.url.pathname.includes('/configuracoes')}
      ><Settings size={18} />A loja</a
    ><a href="/catalogo" target="_blank" rel="noreferrer"><ExternalLink size={17} />Ver catálogo</a>
  </nav>
  {@render children()}
</div>
