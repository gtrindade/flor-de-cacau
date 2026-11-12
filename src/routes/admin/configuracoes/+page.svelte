<script lang="ts">
  import { enhance } from '$app/forms';
  import FormFeedback from '#lib/components/FormFeedback.svelte';
  import { untrack, onMount } from 'svelte';
  import Save from '@lucide/svelte/icons/save';
  import MediaUploader from '#lib/components/MediaUploader.svelte';
  import { weekdays } from '#lib/domain';
  import type { PageProps } from './$types';
  let { data, form }: PageProps = $props();
  let fields = $state(
    untrack(() => {
      const s = data.privateSettings;
      return {
        shopName: s.shopName,
        heroTitle: s.heroTitle,
        heroText: s.heroText,
        aboutTitle: s.aboutTitle,
        aboutText: s.aboutText,
        whatsapp: s.whatsapp,
        address: s.address,
        postalCode: s.postalCode,
        mapUrl: s.mapUrl,
        deliveryNote: s.deliveryNote,
        cardEnabled: s.cardEnabled,
        demo: s.demo,
        cardPrice:
          s.cardPriceCents != null ? (s.cardPriceCents / 100).toFixed(2).replace('.', ',') : ''
      };
    })
  );
  let hours = $state<Record<string, { open: string; close: string }>>(
    untrack(() =>
      Object.fromEntries(
        weekdays.map((day) => [
          day.id,
          {
            open: data.privateSettings.weeklyHours[day.id]?.open ?? '09:00',
            close: data.privateSettings.weeklyHours[day.id]?.close ?? '18:00'
          }
        ])
      )
    )
  );
  let closed = $state<Record<string, boolean>>(
    untrack(() =>
      Object.fromEntries(weekdays.map((d) => [d.id, !data.privateSettings.weeklyHours[d.id]]))
    )
  );
  let uploading = $state(false);
  let saving = $state(false);
  let ready = $state(false);
  onMount(() => {
    ready = true;
  });
</script>

<svelte:head><title>A loja · Administração</title></svelte:head>
<div class="admin-heading">
  <div>
    <h1>O jeitinho da sua loja</h1>
    <p>Atualize sua história, contato e os detalhes do atendimento.</p>
  </div>
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
  <FormFeedback {form} />
  <fieldset class="editor-fields" disabled={!ready}>
    <legend class="sr-only">Informações para edição</legend>
    <div class="editor-columns">
      <div>
        <section class="form-panel">
          <h2>Boas-vindas</h2>
          <label for="shop-name">Nome da floricultura</label><input
            id="shop-name"
            name="shopName"
            bind:value={fields.shopName}
            required
            maxlength="120"
          /><label for="hero-title">Título da página inicial</label><input
            id="hero-title"
            name="heroTitle"
            bind:value={fields.heroTitle}
            required
            maxlength="180"
          /><label for="hero-text">Mensagem de apresentação</label><textarea
            id="hero-text"
            name="heroText"
            required
            maxlength="600"
            rows="3"
            bind:value={fields.heroText}></textarea>
        </section>
        <section class="form-panel">
          <h2>Nossa história</h2>
          <label for="about-title">Título da história</label><input
            id="about-title"
            name="aboutTitle"
            bind:value={fields.aboutTitle}
            required
            maxlength="180"
          /><label for="about-text">Biografia da loja</label><textarea
            id="about-text"
            name="aboutText"
            rows="9"
            required
            maxlength="10000"
            bind:value={fields.aboutText}></textarea>
          <p class="field-hint">Use **negrito**, *itálico* e linhas começando com - para listas.</p>
          <h3>Foto da história</h3>
          <MediaUploader
            name="aboutMedia"
            max={1}
            initial={data.privateSettings.aboutImage ? [data.privateSettings.aboutImage] : []}
            bind:busy={uploading}
          />
        </section>
        <section class="form-panel">
          <h2>Onde o carinho encontra você</h2>
          <label for="whatsapp">WhatsApp com DDI e DDD</label><input
            id="whatsapp"
            name="whatsapp"
            inputmode="tel"
            bind:value={fields.whatsapp}
            required
            pattern={'[0-9]{10,15}'}
          /><label for="address">Endereço completo</label><input
            id="address"
            name="address"
            bind:value={fields.address}
            required
            maxlength="300"
          /><label for="postal-code">CEP</label><input
            id="postal-code"
            name="postalCode"
            bind:value={fields.postalCode}
            required
            maxlength="12"
          /><label for="map-url">Link do mapa</label><input
            id="map-url"
            type="url"
            name="mapUrl"
            bind:value={fields.mapUrl}
            required
          /><label for="delivery-note">Aviso sobre entregas</label><textarea
            id="delivery-note"
            name="deliveryNote"
            required
            maxlength="600"
            rows="3"
            bind:value={fields.deliveryNote}></textarea>
        </section>
      </div>
      <aside>
        <section class="form-panel">
          <h2>Horários de atendimento</h2>
          <p class="field-hint">
            Horário de Brasília. O aviso fora do horário permite continuar o pedido.
          </p>
          <div class="hours-editor">
            {#each weekdays as day}<fieldset>
                <legend>{day.label}</legend><label class="check-row"
                  ><input
                    type="checkbox"
                    name={`${day.id}-closed`}
                    bind:checked={closed[day.id]}
                  />Fechado</label
                >
                <div class="field-pair">
                  <div>
                    <label for={`${day.id}-open`}>Abre</label><input
                      id={`${day.id}-open`}
                      name={`${day.id}-open`}
                      type="time"
                      bind:value={hours[day.id]!.open}
                      disabled={closed[day.id]}
                      required={!closed[day.id]}
                    />
                  </div>
                  <div>
                    <label for={`${day.id}-close`}>Fecha</label><input
                      id={`${day.id}-close`}
                      name={`${day.id}-close`}
                      type="time"
                      bind:value={hours[day.id]!.close}
                      disabled={closed[day.id]}
                      required={!closed[day.id]}
                    />
                  </div>
                </div>
              </fieldset>{/each}
          </div>
        </section>
        <section class="form-panel">
          <h2>Cartão com mensagem</h2>
          <label class="check-row"
            ><input type="checkbox" name="cardEnabled" bind:checked={fields.cardEnabled} />Oferecer
            cartão no pedido</label
          ><label for="card-price">Preço do cartão (R$)</label><input
            id="card-price"
            name="cardPrice"
            inputmode="decimal"
            bind:value={fields.cardPrice}
            placeholder="0,00"
          />
          <p class="field-hint">Um único tipo de cartão. Use zero se for gratuito.</p>
        </section>
        <section class="form-panel">
          <h2>Conteúdo demonstrativo</h2>
          <label class="check-row"
            ><input type="checkbox" name="demo" bind:checked={fields.demo} />Exibir aviso de
            catálogo de demonstração</label
          >
        </section>
      </aside>
    </div>
    <div class="editor-save">
      <p>
        {uploading
          ? 'Aguarde a foto terminar de enviar.'
          : 'As alterações aparecem no site após salvar.'}
      </p>
      <button class="button button-green" disabled={uploading || saving}
        ><Save size={18} />{saving ? 'Salvando…' : 'Salvar informações'}</button
      >
    </div>
  </fieldset>
</form>
