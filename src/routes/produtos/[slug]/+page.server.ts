import { error, fail, redirect } from '@sveltejs/kit';
import { z } from 'zod';
import { getProduct, getSettings } from '#lib/server/catalog';
import { brazilianStates, buildWhatsAppMessage, productOptionPath } from '#lib/domain';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, url }) => {
  const product = await getProduct(params.slug);
  const optionId = url.searchParams.get('opcao');
  const selectedVariant = optionId
    ? product.variants.find((variant) => variant.id === optionId)
    : null;
  if (optionId && !selectedVariant) error(404, 'Opção não encontrada.');
  return {
    product,
    selectedVariant,
    canonicalURL: `${url.origin}${productOptionPath(product.slug, product.mode === 'photo_variants' ? selectedVariant?.id : null)}`
  };
};
const requestSchema = z.object({
  date: z.string().max(10),
  period: z.enum(['combinar', 'manha', 'tarde', 'horario']),
  time: z.string().max(5),
  delivery: z.enum(['pickup', 'delivery']),
  postalCode: z.string().trim().max(9, 'Informe um CEP com 8 números, como 34590-290.'),
  street: z.string().trim().max(180),
  number: z.string().trim().max(20),
  complement: z.string().trim().max(120),
  district: z.string().trim().max(120),
  city: z.string().trim().max(120),
  state: z.string().trim().toUpperCase().max(2, 'Selecione um estado válido.'),
  reference: z.string().trim().max(160),
  note: z.string().trim().max(700),
  cardMessage: z.string().trim().max(300)
});
export const actions: Actions = {
  solicitar: async ({ request, params, url }) => {
    const product = await getProduct(params.slug);
    const input = await request.formData();
    const variantId = String(input.get('variantId') ?? '');
    const variant = variantId
      ? product.variants.find((option) => option.id === variantId)
      : product.mode === 'standard'
        ? product.variant
        : null;
    if (!variant) return fail(400, { error: 'Escolha uma opção válida deste produto.' });
    if (variant.availability === 'unavailable') {
      return fail(409, { error: 'Este produto está indisponível no momento.' });
    }
    const settings = await getSettings();
    const values = Object.fromEntries(
      [
        'date',
        'period',
        'time',
        'delivery',
        'postalCode',
        'street',
        'number',
        'complement',
        'district',
        'city',
        'state',
        'reference',
        'note',
        'cardMessage'
      ].map((key) => [key, String(input.get(key) ?? '')])
    );
    const result = requestSchema.safeParse(values);
    if (!result.success)
      return fail(400, { error: result.error.issues[0]?.message ?? 'Confira os campos.', values });
    const data = result.data;
    if (
      data.date &&
      (!/^\d{4}-\d{2}-\d{2}$/.test(data.date) ||
        Number.isNaN(Date.parse(data.date)) ||
        new Date(data.date).toISOString().slice(0, 10) !== data.date ||
        data.date < settings.opening.today)
    )
      return fail(400, {
        error: 'Escolha uma data a partir de hoje ou deixe a data a combinar.',
        values
      });
    if (data.period === 'horario' && !/^([01]\d|2[0-3]):[0-5]\d$/.test(data.time))
      return fail(400, { error: 'Informe o horário desejado.', values });
    if (data.delivery === 'delivery') {
      if (
        !data.postalCode ||
        !data.street ||
        !data.number ||
        !data.district ||
        !data.city ||
        !data.state
      )
        return fail(400, {
          error:
            'Preencha o endereço de entrega: CEP, rua/avenida, número, bairro, cidade e estado.',
          values
        });
      if (!/^\d{5}-?\d{3}$/.test(data.postalCode))
        return fail(400, { error: 'Informe um CEP com 8 números, como 34590-290.', values });
      if (!brazilianStates.some((state) => state === data.state))
        return fail(400, { error: 'Selecione um estado válido.', values });
    }
    const card = settings.cardEnabled && input.get('card') === 'on';
    if (card && !data.cardMessage)
      return fail(400, { error: 'Escreva a mensagem do cartão.', values });
    const message = buildWhatsAppMessage({
      ...data,
      productName: product.name,
      variantName: product.mode === 'photo_variants' ? variant.name : undefined,
      sku: variant.sku,
      priceCents: variant.priceCents,
      card,
      cardPriceCents: settings.cardPriceCents,
      productUrl: `${url.origin}${productOptionPath(product.slug, product.mode === 'photo_variants' ? variant.id : null)}`
    });
    redirect(303, `https://wa.me/${settings.whatsapp}?text=${encodeURIComponent(message)}`, {
      external: ['https://wa.me']
    });
  }
};
