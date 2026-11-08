import { getProducts, getCategories } from '#lib/server/catalog';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = async ({ url }) => {
  const query = url.searchParams.get('q')?.trim().slice(0, 120) ?? '';
  const category = url.searchParams.get('categoria') ?? '';
  const clean = (v: string) =>
    v
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .toLowerCase();
  const term = clean(query);
  const products = (await getProducts()).filter(
    (p) =>
      (!query || clean(p.name).includes(term) || clean(p.variant.sku).includes(term)) &&
      (!category || p.categories.some((c) => c.slug === category))
  );
  return { products, categories: await getCategories(), query, category };
};
