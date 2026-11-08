<script lang="ts">
  import { createAuthClient } from 'better-auth/svelte';
  import Flower2 from '@lucide/svelte/icons/flower-2';
  import ArrowLeft from '@lucide/svelte/icons/arrow-left';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  let error = $state('');
  let pending = $state(false);
  async function login() {
    pending = true;
    error = '';
    try {
      const result = await createAuthClient().signIn.social({
        provider: 'google',
        callbackURL: '/admin',
        errorCallbackURL: '/entrar?error=access_denied'
      });
      if (result.error) error = 'Não foi possível entrar. Confira se esta conta está autorizada.';
    } catch {
      error = 'Não foi possível conectar. Tente novamente.';
    } finally {
      pending = false;
    }
  }
</script>

<svelte:head
  ><title>Administração · Flor de Cacau</title><meta
    name="robots"
    content="noindex,nofollow"
  /></svelte:head
>
<div class="container login-page">
  <div class="login-card">
    <Flower2 size={36} strokeWidth={1} />
    <p class="eyebrow">UM CANTINHO PARA CUIDAR DA LOJA</p>
    <h1>Que bom ter você aqui.</h1>
    <p>
      Entre com sua conta Google autorizada para cuidar do catálogo e das informações da
      floricultura.
    </p>
    {#if error || data.denied}<p class="form-error" role="alert">
        {error || 'Esta conta não possui acesso administrativo.'}
      </p>{/if}<button
      class="button button-green"
      onclick={login}
      disabled={!data.googleConfigured || pending}
      >{pending ? 'Conectando…' : 'Entrar com Google'}</button
    >{#if !data.googleConfigured}<p class="notice">
        O acesso Google ainda precisa ser configurado neste ambiente.
      </p>{/if}<a href="/" class="back-link"><ArrowLeft size={16} />Voltar ao site</a>
  </div>
</div>
