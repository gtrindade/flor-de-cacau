import { fail } from '@sveltejs/kit';
import { randomUUID } from 'node:crypto';
import { eq, sql } from 'drizzle-orm';
import { z } from 'zod';
import { db } from '#lib/server/db';
import { categories } from '#lib/server/db/schema';
import { getCategories } from '#lib/server/catalog';
import { requireAdmin } from '#lib/server/guards';
import { slugify } from '#lib/domain';
import { actionError } from '#lib/server/product-actions';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { categories: await getCategories() };
};
export const actions: Actions = {
  save: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    try {
      const name = z
        .string()
        .trim()
        .min(2, 'Informe um nome com pelo menos 2 letras.')
        .max(60)
        .parse(f.get('name'));
      const id = String(f.get('id') ?? '');
      if (id) await db.update(categories).set({ name }).where(eq(categories.id, id));
      else {
        const [row] = await db
          .select({ position: sql<number>`coalesce(max(${categories.position}), 0) + 1` })
          .from(categories);
        await db.insert(categories).values({
          id: randomUUID(),
          name,
          slug: `${slugify(name)}-${randomUUID().slice(0, 4)}`,
          position: row?.position ?? 0
        });
      }
      return { success: 'Categoria salva.' };
    } catch (e) {
      return fail(400, { error: actionError(e) });
    }
  },
  delete: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    if (f.get('confirm') !== 'on') return fail(400, { error: 'Confirme a remoção da categoria.' });
    await db.delete(categories).where(eq(categories.id, String(f.get('id'))));
    return { success: 'Categoria removida. Os produtos foram preservados.' };
  }
};
