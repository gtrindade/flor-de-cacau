import { fail, redirect } from '@sveltejs/kit';
import { getCategories } from '#lib/server/catalog';
import { requireAdmin } from '#lib/server/guards';
import { createBatchProducts } from '#lib/server/product-bundles';
import { actionError } from '#lib/server/product-actions';
import type { Actions, PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ locals }) => {
  requireAdmin(locals);
  return { categories: await getCategories() };
};
export const actions: Actions = {
  default: async ({ request, locals }) => {
    const user = requireAdmin(locals);
    let ids;
    try {
      ids = await createBatchProducts(await request.formData(), user.id);
    } catch (cause) {
      return fail(400, { error: actionError(cause) });
    }
    redirect(303, `/admin?lote=${ids.length}`);
  }
};
