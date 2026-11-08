import { fail } from '@sveltejs/kit';
import { getCategories, getProduct } from '#lib/server/catalog';
import { requireAdmin } from '#lib/server/guards';
import { saveProduct, actionError } from '#lib/server/product-actions';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ params, locals, url }) => {
  requireAdmin(locals);
  return {
    product: await getProduct(params.id, true),
    categories: await getCategories(),
    saved: url.searchParams.has('salvo')
  };
};
export const actions: Actions = {
  default: async ({ request, locals, params }) => {
    const user = requireAdmin(locals);
    try {
      await saveProduct(await request.formData(), user.id, params.id);
      return { success: 'Produto salvo com carinho.' };
    } catch (e) {
      return fail(400, { error: actionError(e) });
    }
  }
};
