import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { and, eq, inArray, ne, or } from 'drizzle-orm';
import { db } from './db';
import { products, variants, productCategories, categories, media } from './db/schema';
import { parseMoney, slugify } from '../domain';
import { removeFiles } from './uploads';

const productInput = z.object({
  name: z.string().trim().min(2, 'Informe o nome do produto.').max(180),
  description: z.string().max(6000),
  publication: z.enum(['draft', 'published', 'hidden']),
  availability: z.enum(['available', 'on_request', 'check', 'unavailable']),
  sku: z.string().trim().max(80),
  categoryIds: z.array(z.string()).max(30),
  mediaIds: z.array(z.string()).max(8)
});
export async function saveProduct(form: FormData, ownerId: string, id?: string) {
  const parsed = productInput.parse({
    name: form.get('name'),
    description: form.get('description') ?? '',
    publication: form.get('publication'),
    availability: form.get('availability'),
    sku: form.get('sku') ?? '',
    categoryIds: form.getAll('categoryIds'),
    mediaIds: JSON.parse(String(form.get('mediaIds') ?? '[]'))
  });
  const priceCents = parseMoney(String(form.get('price') ?? ''));
  const showPrice = form.get('showPrice') === 'on';
  if (parsed.publication === 'published' && showPrice && priceCents === null)
    throw new Error('Informe o preço ou escolha exibir preço sob consulta.');
  const productId = id ?? randomUUID();
  const existing = id ? (await db.select().from(products).where(eq(products.id, id)))[0] : null;
  if (id && !existing) throw new Error('Produto não encontrado.');
  const selectedMedia = parsed.mediaIds.length
    ? await db.select().from(media).where(inArray(media.id, parsed.mediaIds))
    : [];
  if (
    selectedMedia.length !== new Set(parsed.mediaIds).size ||
    selectedMedia.some(
      (m) => m.productId !== productId && (m.productId !== null || m.ownerId !== ownerId)
    )
  )
    throw new Error('Uma das fotos não está disponível. Envie-a novamente.');
  const selectedCategories = parsed.categoryIds.length
    ? await db.select().from(categories).where(inArray(categories.id, parsed.categoryIds))
    : [];
  if (selectedCategories.length !== new Set(parsed.categoryIds).size)
    throw new Error('Uma categoria não está disponível. Atualize a página.');
  const previous = id ? await db.select().from(media).where(eq(media.productId, id)) : [];
  const removed = previous.filter((m) => !parsed.mediaIds.includes(m.id));
  await db.transaction(async (tx) => {
    if (existing)
      await tx
        .update(products)
        .set({
          name: parsed.name,
          description: parsed.description,
          publication: parsed.publication,
          featured: form.get('featured') === 'on',
          updatedAt: new Date()
        })
        .where(eq(products.id, productId));
    else
      await tx.insert(products).values({
        id: productId,
        slug: `${slugify(parsed.name)}-${productId.slice(0, 6)}`,
        name: parsed.name,
        description: parsed.description,
        publication: parsed.publication,
        featured: form.get('featured') === 'on'
      });
    const [variant] = await tx
      .select()
      .from(variants)
      .where(eq(variants.productId, productId))
      .limit(1);
    const values = {
      sku: parsed.sku || `FC-${productId.slice(0, 8).toUpperCase()}`,
      priceCents,
      showPrice,
      availability: parsed.availability
    };
    if (variant) await tx.update(variants).set(values).where(eq(variants.id, variant.id));
    else await tx.insert(variants).values({ id: randomUUID(), productId, ...values });
    await tx.delete(productCategories).where(eq(productCategories.productId, productId));
    if (parsed.categoryIds.length)
      await tx
        .insert(productCategories)
        .values([...new Set(parsed.categoryIds)].map((categoryId) => ({ productId, categoryId })));
    if (removed.length)
      await tx.delete(media).where(
        inArray(
          media.id,
          removed.map((m) => m.id)
        )
      );
    for (const [position, mediaId] of parsed.mediaIds.entries())
      await tx
        .update(media)
        .set({ productId, position, alt: parsed.name })
        .where(eq(media.id, mediaId));
  });
  await removeFiles(removed.map((m) => m.storageKey));
  return productId;
}
export async function deleteProduct(id: string) {
  const images = await db.select().from(media).where(eq(media.productId, id));
  await db.delete(products).where(eq(products.id, id));
  await removeFiles(images.map((m) => m.storageKey));
}
export function actionError(cause: unknown) {
  if (cause instanceof z.ZodError) return cause.issues[0]?.message ?? 'Confira os dados.';
  if (cause instanceof SyntaxError) return 'Confira as fotos selecionadas.';
  if (
    cause instanceof Error &&
    'cause' in cause &&
    (cause.cause as { code?: string })?.code === '23505'
  )
    return 'Essa referência já está em uso.';
  return cause instanceof Error && !cause.message.includes('Failed query')
    ? cause.message
    : 'Não foi possível salvar. Confira os dados e tente novamente.';
}
