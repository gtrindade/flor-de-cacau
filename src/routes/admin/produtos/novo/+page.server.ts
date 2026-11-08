import { fail, redirect } from '@sveltejs/kit';
import { getCategories } from '#lib/server/catalog';
import { requireAdmin } from '#lib/server/guards';
import { saveProduct, actionError } from '#lib/server/product-actions';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { product: null, categories: await getCategories() };
};
export const actions: Actions = {
  default: async ({ request, locals }) => {
    const user = requireAdmin(locals);
    let id: string;
    try {
      id = await saveProduct(await request.formData(), user.id);
    } catch (e) {
      return fail(400, { error: actionError(e) });
    }
    redirect(303, `/admin/produtos/${id}?salvo=1`);
  }
};
