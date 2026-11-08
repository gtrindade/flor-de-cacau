import { fail } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '#lib/server/db';
import { siteSettings, media } from '#lib/server/db/schema';
import { getSettings } from '#lib/server/catalog';
import { requireAdmin } from '#lib/server/guards';
import { parseMoney, weekdays, type WeeklyHours } from '#lib/domain';
import { actionError } from '#lib/server/product-actions';
import type { Actions, PageServerLoad } from './$types';
const text = (max: number) => z.string().trim().min(1, 'Preencha os campos obrigatórios.').max(max);
const schema = z.object({
  shopName: text(120),
  whatsapp: z.string().regex(/^\d{10,15}$/, 'Informe o WhatsApp com DDI e DDD, somente números.'),
  address: text(300),
  postalCode: text(12),
  mapUrl: z
    .url()
    .refine((s) => s.startsWith('https://'), 'O link do mapa deve começar com https://.'),
  heroTitle: text(180),
  heroText: text(600),
  aboutTitle: text(180),
  aboutText: text(10000),
  deliveryNote: text(600)
});
export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { privateSettings: await getSettings(true) };
};
export const actions: Actions = {
  default: async ({ request, locals }) => {
    const user = requireAdmin(locals);
    const form = await request.formData();
    try {
      const data = schema.parse(Object.fromEntries(form));
      const weeklyHours: WeeklyHours = {};
      for (const day of weekdays) {
        if (form.get(`${day.id}-closed`) === 'on') {
          weeklyHours[day.id] = null;
          continue;
        }
        const open = String(form.get(`${day.id}-open`) ?? '');
        const close = String(form.get(`${day.id}-close`) ?? '');
        if (
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(open) ||
          !/^([01]\d|2[0-3]):[0-5]\d$/.test(close) ||
          open >= close
        )
          throw new Error(
            `Confira o horário de ${day.label.toLowerCase()}. A abertura deve ser antes do fechamento.`
          );
        weeklyHours[day.id] = { open, close };
      }
      const cardEnabled = form.get('cardEnabled') === 'on';
      const cardPriceCents = parseMoney(String(form.get('cardPrice') ?? ''));
      if (cardEnabled && cardPriceCents === null)
        throw new Error('Informe o valor do cartão. Use 0 para gratuito.');
      const ids = z
        .array(z.string())
        .max(1)
        .parse(JSON.parse(String(form.get('aboutMedia') ?? '[]')));
      const aboutImageId = ids[0] ?? null;
      if (aboutImageId) {
        const [image] = await db.select().from(media).where(eq(media.id, aboutImageId));
        const old = await getSettings(true);
        if (
          !image ||
          image.productId ||
          (image.ownerId !== user.id && old.aboutImageId !== aboutImageId)
        )
          throw new Error('Envie novamente a foto da história.');
      }
      await db
        .update(siteSettings)
        .set({
          ...data,
          weeklyHours,
          cardEnabled,
          cardPriceCents,
          aboutImageId,
          demo: form.get('demo') === 'on',
          updatedAt: new Date()
        })
        .where(eq(siteSettings.id, 'main'));
      return { success: 'Informações da loja atualizadas.' };
    } catch (e) {
      return fail(400, { error: actionError(e) });
    }
  }
};
