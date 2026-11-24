import { fail, redirect } from '@sveltejs/kit';
import { eq } from 'drizzle-orm';
import { getProducts } from '#lib/server/catalog';
import { db } from '#lib/server/db';
import { products, variants } from '#lib/server/db/schema';
import { requireAdmin } from '#lib/server/guards';
import { deleteProduct, actionError } from '#lib/server/product-actions';
import { groupProducts } from '#lib/server/product-bundles';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals, url }) => {
  requireAdmin(locals);
  const createdCount = Number(url.searchParams.get('lote'));
  return {
    products: await getProducts(true),
    createdCount: Number.isSafeInteger(createdCount) && createdCount > 0 ? createdCount : 0
  };
};
export const actions: Actions = {
  group: async ({ request, locals }) => {
    requireAdmin(locals);
    let id;
    try {
      id = await groupProducts(await request.formData());
    } catch (cause) {
      return fail(400, { error: actionError(cause) });
    }
    redirect(303, `/admin/produtos/${id}?agrupado=1`);
  },
  visibility: async ({ request, locals }) => {
    requireAdmin(locals);
    const form = await request.formData();
    const id = String(form.get('id'));
    const publication = form.get('publication');
    if (publication !== 'hidden' && publication !== 'published')
      return fail(400, { error: 'Escolha uma opção válida.' });
    const options = await db.select().from(variants).where(eq(variants.productId, id));
    if (!options.length) return fail(404, { error: 'Produto não encontrado.' });
    if (
      publication === 'published' &&
      options.some((variant) => variant.showPrice && variant.priceCents === null)
    )
      return fail(400, { error: 'Edite o produto para informar o preço antes de publicar.' });
    await db
      .update(products)
      .set({ publication, updatedAt: new Date() })
      .where(eq(products.id, id));
    return { success: 'Visibilidade atualizada.' };
  },
  availability: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    const availability = f.get('availability');
    if (!['available', 'on_request', 'check', 'unavailable'].includes(String(availability)))
      return fail(400, { error: 'Disponibilidade inválida.' });
    await db
      .update(variants)
      .set({ availability: String(availability) })
      .where(eq(variants.productId, String(f.get('id'))));
    return { success: 'Disponibilidade atualizada.' };
  },
  delete: async ({ request, locals }) => {
    requireAdmin(locals);
    const f = await request.formData();
    const [product] = await db
      .select()
      .from(products)
      .where(eq(products.id, String(f.get('id'))));
    if (!product || f.get('confirmation') !== product.name)
      return fail(400, { error: 'Digite o nome exato do produto para excluir.' });
    try {
      if (!(await deleteProduct(product.id)))
        return fail(404, { error: 'Este produto foi reorganizado ou excluído. Atualize a lista.' });
      return { success: 'Produto excluído permanentemente.' };
    } catch (e) {
      return fail(400, { error: actionError(e) });
    }
  }
};
