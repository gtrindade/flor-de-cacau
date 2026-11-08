<script lang="ts">
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Flower2 from '@lucide/svelte/icons/flower-2';
  import Gift from '@lucide/svelte/icons/gift';
  import Leaf from '@lucide/svelte/icons/leaf';
  import Heart from '@lucide/svelte/icons/heart';
  import ShoppingBasket from '@lucide/svelte/icons/shopping-basket';
  import MessageCircle from '@lucide/svelte/icons/message-circle';
  import Sparkles from '@lucide/svelte/icons/sparkles';
  import ProductCard from '#lib/components/ProductCard.svelte';
  import type { PageProps } from './$types';
  let { data }: PageProps = $props();
  const icons = [Flower2, Leaf, Flower2, ShoppingBasket, Gift];
</script>

<svelte:head
  ><title>Flor de Cacau · Flores e presentes em Sabará</title><meta
    name="description"
    content="Buquês, arranjos, flores, cestas e presentes em Sabará. Conheça a Flor de Cacau e combine seu pedido pelo WhatsApp."
  /></svelte:head
>
<section class="hero">
  <div class="container hero-grid">
    <div class="hero-copy">
      <p class="eyebrow"><span></span> FLORICULTURA EM SABARÁ</p>
      <h1>
        {#if data.settings.heroTitle === 'Carinho que floresce em cada detalhe.'}Carinho que
          floresce <em>em cada detalhe.</em>{:else}{data.settings.heroTitle}{/if}
      </h1>
      <p class="hero-description">{data.settings.heroText}</p>
      <div class="hero-actions">
        <a href="/catalogo" class="button button-green"
          >Conheça nosso catálogo <ArrowRight size={18} /></a
        ><span class="hero-personal"
          ><Heart size={18} strokeWidth={1.4} /> Atendimento de pertinho,<br />pelo WhatsApp.</span
        >
      </div>
      <div class="hero-caption">
        <span class="small-flower">✳</span> Para os grandes dias. E para os pequenos também.
      </div>
    </div>
    <div class="hero-art">
      <div class="hero-image-wrap">
        <img
          src="/demo/rosas-rosas.jpg"
          alt="Buquê de rosas em tons suaves, imagem ilustrativa"
          fetchpriority="high"
          width="600"
          height="750"
        />
      </div>
      <span class="hero-stamp"><Flower2 size={25} strokeWidth={1.2} />Flores que<br />abraçam.</span
      >
      <div class="hero-image-note">
        <span>GESTOS QUE ENCANTAM</span>
        <p>Uma surpresa.<br />Muitos sentimentos.</p>
        <Heart size={26} strokeWidth={1} />
      </div>
    </div>
  </div>
</section>
<section class="category-section">
  <div class="container">
    <div class="category-heading">
      <p class="eyebrow">ENCONTRE SEU JEITO DE PRESENTEAR</p>
      <span>O carinho pode ter muitas formas.</span>
    </div>
    <div class="category-grid">
      {#each data.categories as category, i}{@const Icon = icons[i % icons.length]!}<a
          href={`/catalogo?categoria=${category.slug}`}
          class="category-item"
          ><span class="category-icon"><Icon size={28} strokeWidth={1.2} /></span><span
            class="category-name">{category.name}</span
          ></a
        >{/each}
    </div>
  </div>
</section>
<section class="section container" id="destaques">
  <div class="section-heading">
    <div>
      <p class="eyebrow">ESCOLHIDOS COM CARINHO</p>
      <h2>Para fazer alguém sorrir.</h2>
    </div>
    <a href="/catalogo" class="text-link">Ver todo o catálogo <ArrowRight size={17} /></a>
  </div>
  {#if data.products.length}<div class="product-grid">
      {#each data.products as product}<ProductCard {product} />{/each}
    </div>{:else}<div class="empty-state">
      <Flower2 />
      <h3>Estamos preparando novidades.</h3>
      <a href="/catalogo" class="text-link">Conheça nosso catálogo</a>
    </div>{/if}
</section>
<section class="care-strip">
  <div class="container care-grid">
    <div>
      <Flower2 size={25} strokeWidth={1.2} />
      <h3>Escolhas especiais</h3>
      <p>Flores e presentes para cada ocasião.</p>
    </div>
    <div>
      <MessageCircle size={25} strokeWidth={1.2} />
      <h3>Uma boa conversa</h3>
      <p>Os detalhes do seu pedido, do seu jeito.</p>
    </div>
    <div>
      <Heart size={25} strokeWidth={1.2} />
      <h3>Carinho em cada gesto</h3>
      <p>Para estar perto, mesmo de longe.</p>
    </div>
  </div>
</section>
<section class="section container about-grid" id="sobre">
  <div class="about-image">
    {#if data.settings.aboutImage}<img
        src={data.settings.aboutImage.url}
        alt={data.settings.aboutImage.alt}
        loading="lazy"
      />{:else}<img
        src="/demo/cesta-floral.jpg"
        alt="Composição floral ilustrativa"
        loading="lazy"
      />{/if}
    <div class="about-seal">Flores &<br /><em>afeto.</em></div>
  </div>
  <div class="about-copy">
    <p class="eyebrow">NOSSA HISTÓRIA</p>
    <h2>{data.settings.aboutTitle}</h2>
    <div class="prose">{@html data.settings.aboutHtml}</div>
  </div>
</section>
