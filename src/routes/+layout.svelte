<script lang="ts">
  import '../app.css';
  import WhatsAppIcon from '#lib/components/WhatsAppIcon.svelte';
  import MapPin from '@lucide/svelte/icons/map-pin';
  import ArrowUpRight from '@lucide/svelte/icons/arrow-up-right';
  import Flower2 from '@lucide/svelte/icons/flower-2';
  import { weekdays } from '#lib/domain';
  import type { LayoutProps } from './$types';
  let { data, children }: LayoutProps = $props();
</script>

<a href="#conteudo" class="skip-link">Ir para o conteúdo</a>
<header class="site-header">
  <div class="header-inner">
    <a href="/" aria-label="Flor de Cacau — início" class="brand"
      ><img src="/brand/logo.png" alt="Flor de Cacau Floricultura" width="1000" height="333" /></a
    >
    <nav aria-label="Navegação principal">
      <a href="/catalogo">Nosso catálogo</a><a href="/#sobre">Nossa história</a><a href="/#visite"
        >Visite a loja</a
      >
    </nav>
    {#if data.settings}<a
        class="button button-green header-contact"
        href={`https://wa.me/${data.settings.whatsapp}`}
        target="_blank"
        rel="noopener noreferrer"><WhatsAppIcon /><span>Vamos conversar</span></a
      >{/if}
  </div>
</header>
<main id="conteudo">{@render children()}</main>
{#if data.settings}
  <footer class="site-footer" id="visite">
    <div class="container footer-grid">
      <div class="footer-intro">
        <Flower2 size={30} strokeWidth={1.2} />
        <h2>Um carinho perto de você.</h2>
        <p>Flores, cestas e presentes em Sabará.<br />Cada detalhe começa com uma conversa.</p>
        <a class="text-link" href={data.settings.mapUrl} target="_blank" rel="noreferrer"
          >Como chegar <ArrowUpRight size={16} /></a
        >
      </div>
      <div>
        <h3>Venha nos visitar</h3>
        <p class="address">
          <MapPin size={18} /><span
            >{data.settings.address}<br />CEP {data.settings.postalCode}</span
          >
        </p>
        <a
          class="text-link"
          href={`https://wa.me/${data.settings.whatsapp}`}
          target="_blank"
          rel="noopener noreferrer"><WhatsAppIcon size={20} variant="green" />Falar pelo WhatsApp</a
        >
      </div>
      <div>
        <h3>Horários de atendimento</h3>
        <dl class="hours">
          {#each weekdays as day}<div>
              <dt>{day.label}</dt>
              <dd>
                {data.settings.weeklyHours[day.id]
                  ? `${data.settings.weeklyHours[day.id]!.open}–${data.settings.weeklyHours[day.id]!.close}`
                  : 'Fechado'}
              </dd>
            </div>{/each}
        </dl>
      </div>
    </div>
    <div class="container footer-bottom">
      <span>© {new Date().getFullYear()} Flor de Cacau. Feito com carinho.</span><a
        href={data.admin ? '/admin' : '/entrar'}>Administração</a
      >
    </div>
  </footer>
  {#if data.settings.demo}<aside class="demo-note" aria-label="Conteúdo demonstrativo">
      Catálogo de demonstração · Preços e disponibilidade fictícios.
    </aside>{/if}
{/if}
