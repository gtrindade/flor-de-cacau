import { getProducts, getCategories } from '#lib/server/catalog';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async () => ({
  products: (await getProducts()).filter((p) => p.featured),
  categories: await getCategories()
});
