<script lang="ts">
  import { untrack } from 'svelte';
  import { enhance } from '$app/forms';
  import WhatsAppIcon from '#lib/components/WhatsAppIcon.svelte';
  import ArrowRight from '@lucide/svelte/icons/arrow-right';
  import Info from '@lucide/svelte/icons/info';
  import * as Dialog from '#lib/components/ui/dialog';
  import { brazilianStates, money } from '#lib/domain';
  import type { Product, Settings } from '#lib/server/catalog';
  let {
    product,
    settings,
    form
  }: {
    product: Product;
    settings: Settings;
    form?: { error?: string; values?: Record<string, string> } | null;
  } = $props();
  let fields = $state(
    untrack(() => ({
      date: form?.values?.date ?? '',
      time: form?.values?.time ?? '',
      postalCode: form?.values?.postalCode ?? '',
      street: form?.values?.street ?? '',
      number: form?.values?.number ?? '',
      complement: form?.values?.complement ?? '',
      district: form?.values?.district ?? '',
      city: form?.values?.city ?? '',
      state: form?.values?.state ?? '',
      reference: form?.values?.reference ?? '',
      note: form?.values?.note ?? '',
      cardMessage: form?.values?.cardMessage ?? ''
    }))
  );
  let open = $state(untrack(() => !!form?.error));
  let delivery = $state(untrack(() => form?.values?.delivery ?? 'pickup'));
  let period = $state(untrack(() => form?.values?.period ?? 'combinar'));
  let card = $state(false);
  let unknown = $state(untrack(() => !form?.values?.date));
  let sending = $state(false);
  let whatsappUrl = $state('');
  let requestError = $state(untrack(() => form?.error ?? ''));
</script>

<Dialog.Root bind:open
  ><Dialog.Trigger class="button button-green order-trigger"
    ><WhatsAppIcon />{product.variant.availability === 'check'
      ? 'Consultar disponibilidade'
      : 'Pedir via WhatsApp'}<ArrowRight size={17} /></Dialog.Trigger
  ><Dialog.Content class="order-dialog"
    ><Dialog.Header
      ><p class="eyebrow">VAMOS COMBINAR OS DETALHES</p>
      <Dialog.Title>Seu pedido começa aqui.</Dialog.Title><Dialog.Description
        >{product.name} · {product.variant.priceCents !== null
          ? money(product.variant.priceCents)
          : 'Preço sob consulta'}</Dialog.Description
      ></Dialog.Header
    >
    <form
      method="POST"
      action="?/solicitar"
      target="_blank"
      rel="noopener noreferrer"
      oninput={() => (whatsappUrl = '')}
      use:enhance={() => {
        // Reserve the tab during the click, before awaiting server validation.
        // Opening it only after fetch can be blocked by mobile browsers.
        let conversation: Window | null = null;
        try {
          conversation = window.open('', '_blank');
          if (conversation) conversation.opener = null;
        } catch {
          conversation?.close();
          conversation = null;
        }
        whatsappUrl = '';
        requestError = '';
        sending = true;
        return async ({ result, update }) => {
          sending = false;
          if (result.type === 'redirect') {
            if (conversation && !conversation.closed) {
              try {
                conversation.location.replace(result.location);
              } catch {
                conversation.close();
                whatsappUrl = result.location;
              }
            } else whatsappUrl = result.location;
          } else {
            conversation?.close();
            if (result.type === 'error') {
              requestError = 'Não foi possível preparar a conversa. Tente novamente.';
            } else {
              await update({ reset: false });
              if (result.type === 'failure')
                requestError =
                  typeof result.data?.error === 'string'
                    ? result.data.error
                    : 'Confira os campos e tente novamente.';
            }
          }
        };
      }}
      class="order-form"
    >
      {#if requestError}<p class="form-error" role="alert">{requestError}</p>{/if}
      {#if !settings.opening.open}<div class="notice">
          <Info size={18} />
          <p>
            <strong>Estamos fora do horário de atendimento.</strong> Você pode enviar sua solicitação
            normalmente. Responderemos assim que possível.
          </p>
        </div>{/if}
      <fieldset>
        <legend>Para quando é o carinho?</legend><label class="check-row"
          ><input type="checkbox" bind:checked={unknown} />Ainda não sei a data</label
        >{#if !unknown}<label for="request-date">Data desejada</label><input
            id="request-date"
            name="date"
            type="date"
            min={settings.opening.today}
            required
            bind:value={fields.date}
          />{:else}<input type="hidden" name="date" value="" />{/if}<label for="period"
          >Período ou horário</label
        ><select id="period" name="period" bind:value={period}
          ><option value="combinar">A combinar</option><option value="manha">Manhã</option><option
            value="tarde">Tarde</option
          ><option value="horario">Informar horário</option></select
        >{#if period === 'horario'}<label for="time">Horário desejado</label><input
            id="time"
            name="time"
            type="time"
            required
            bind:value={fields.time}
          />{/if}
      </fieldset>
      <fieldset>
        <legend>Como você prefere receber?</legend>
        <div class="delivery-options">
          <label class:chosen={delivery === 'pickup'}
            ><input type="radio" name="delivery" value="pickup" bind:group={delivery} />Retirada na
            loja</label
          ><label class:chosen={delivery === 'delivery'}
            ><input
              type="radio"
              name="delivery"
              value="delivery"
              bind:group={delivery}
            />Entrega</label
          >
        </div>
        {#if delivery === 'delivery'}<div
            id="delivery-address"
            role="group"
            aria-label="Endereço de entrega"
          >
            <div class="field-pair">
              <div class="address-field">
                <label for="postal-code">CEP</label><input
                  id="postal-code"
                  name="postalCode"
                  inputmode="numeric"
                  autocomplete="shipping postal-code"
                  placeholder="00000-000"
                  pattern={'[0-9]{5}-?[0-9]{3}'}
                  maxlength="9"
                  required
                  title="Informe 8 números, com ou sem hífen."
                  bind:value={fields.postalCode}
                />
              </div>
              <div class="address-field">
                <label for="address-state">Estado (UF)</label><select
                  id="address-state"
                  name="state"
                  autocomplete="shipping address-level1"
                  required
                  bind:value={fields.state}
                >
                  <option value="">Selecione</option>
                  {#each brazilianStates as state}<option value={state}>{state}</option>{/each}
                </select>
              </div>
            </div>
            <div class="field-pair address-street-row">
              <div class="address-field">
                <label for="street">Rua ou avenida</label><input
                  id="street"
                  name="street"
                  autocomplete="shipping address-line1"
                  required
                  maxlength="180"
                  bind:value={fields.street}
                />
              </div>
              <div class="address-field">
                <label for="address-number">Número</label><input
                  id="address-number"
                  name="number"
                  placeholder="123 ou s/n"
                  required
                  maxlength="20"
                  bind:value={fields.number}
                />
              </div>
            </div>
            <div class="address-field">
              <label for="complement">Complemento <span class="optional">Opcional</span></label
              ><input
                id="complement"
                name="complement"
                autocomplete="shipping address-line2"
                placeholder="Apartamento, bloco, casa…"
                maxlength="120"
                bind:value={fields.complement}
              />
            </div>
            <div class="field-pair">
              <div class="address-field">
                <label for="district">Bairro</label><input
                  id="district"
                  name="district"
                  autocomplete="shipping address-level3"
                  required
                  maxlength="120"
                  bind:value={fields.district}
                />
              </div>
              <div class="address-field">
                <label for="city">Cidade</label><input
                  id="city"
                  name="city"
                  autocomplete="shipping address-level2"
                  required
                  maxlength="120"
                  bind:value={fields.city}
                />
              </div>
            </div>
            <div class="address-field">
              <label for="address-reference"
                >Ponto de referência <span class="optional">Opcional</span></label
              ><input
                id="address-reference"
                name="reference"
                maxlength="160"
                bind:value={fields.reference}
              />
            </div>
            <p class="field-hint">{settings.deliveryNote}</p>
          </div>
        {/if}
      </fieldset>
      {#if settings.cardEnabled}<fieldset>
          <legend>Um toque pessoal</legend><label class="check-row"
            ><input type="checkbox" name="card" bind:checked={card} />Adicionar cartão
            <span>+ {money(settings.cardPriceCents ?? 0)}</span></label
          >{#if card}<label for="card-message">Mensagem do cartão</label><textarea
              id="card-message"
              name="cardMessage"
              required
              maxlength="300"
              rows="3"
              placeholder="Escreva seu carinho em palavras…"
              bind:value={fields.cardMessage}></textarea>{#if product.variant.priceCents !== null}<p
                class="subtotal"
              >
                Subtotal estimado <strong
                  >{money(product.variant.priceCents + (settings.cardPriceCents ?? 0))}</strong
                >
              </p>{/if}{/if}
        </fieldset>{/if}
      <label for="note">Quer contar mais alguma coisa? <span class="optional">Opcional</span></label
      ><textarea
        id="note"
        name="note"
        maxlength="700"
        rows="2"
        placeholder="Preferências, ocasião ou outros detalhes…"
        bind:value={fields.note}></textarea>
      <p class="field-hint">Disponibilidade, entrega e pagamento serão confirmados na conversa.</p>
      {#if whatsappUrl}
        <p class="field-hint" role="status">
          Sua mensagem está pronta. Abra a conversa em uma nova aba.
        </p>
        <a class="button button-green" href={whatsappUrl} target="_blank" rel="noopener noreferrer"
          >Continuar no WhatsApp<WhatsAppIcon /></a
        >
      {:else}
        <button class="button button-green" type="submit" disabled={sending}
          >{sending ? 'Abrindo conversa…' : 'Continuar no WhatsApp'}<WhatsAppIcon /></button
        >
      {/if}
    </form></Dialog.Content
  ></Dialog.Root
>
