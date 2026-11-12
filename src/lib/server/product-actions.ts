import { z } from 'zod';
import { randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { db } from './db';
import { products, variants, productCategories, categories, media } from './db/schema';
import { parseMoney, slugify } from '../domain';
import { removeFiles } from './uploads';

const availability = z.enum(['available', 'on_request', 'check', 'unavailable']);
const optionInput = z.object({
  id: z.string().max(120).default(''),
  imageId: z.string().min(1).max(120),
  name: z.string().trim().max(180).default(''),
  sku: z.string().trim().max(80).default(''),
  price: z.string().max(40),
  showPrice: z.boolean(),
  availability
});
const productInput = z.object({
  name: z.string().trim().min(2, 'Informe o nome do produto.').max(180),
  description: z.string().max(6000),
  mode: z.enum(['standard', 'photo_variants']),
  publication: z.enum(['draft', 'published', 'hidden']),
  availability,
  sku: z.string().trim().max(80),
  categoryIds: z.array(z.string()).max(30),
  mediaIds: z.array(z.string().min(1).max(120))
});
export async function saveProduct(form: FormData, ownerId: string, id?: string) {
  const parsed = productInput.parse({
    name: form.get('name'),
    description: form.get('description') ?? '',
    mode: form.get('mode') ?? 'standard',
    publication: form.get('publication'),
    availability: form.get('availability') ?? 'available',
    sku: form.get('sku') ?? '',
    categoryIds: form.getAll('categoryIds'),
    mediaIds: JSON.parse(String(form.get('mediaIds') ?? '[]'))
  });
  if (new Set(parsed.mediaIds).size !== parsed.mediaIds.length)
    throw new Error('Cada foto deve aparecer apenas uma vez.');
  if (parsed.mode === 'standard' && parsed.mediaIds.length > 8)
    throw new Error(
      'O produto com preço único permite até 8 fotos. Escolha o modo de preço por foto para mais opções.'
    );
  const options =
    parsed.mode === 'photo_variants'
      ? z
          .array(optionInput)
          .min(1, 'Adicione pelo menos uma foto para criar as opções.')
          .parse(JSON.parse(String(form.get('variants') ?? '[]')))
      : [];
  if (
    parsed.mode === 'photo_variants' &&
    (options.length !== parsed.mediaIds.length ||
      options.some((option, index) => option.imageId !== parsed.mediaIds[index]) ||
      new Set(options.filter((option) => option.id).map((option) => option.id)).size !==
        options.filter((option) => option.id).length)
  )
    throw new Error('Confira as opções e suas fotos antes de salvar.');
  const priceCents =
    parsed.mode === 'standard' ? parseMoney(String(form.get('price') ?? '')) : null;
  const showPrice = form.get('showPrice') === 'on';
  if (
    parsed.mode === 'standard' &&
    parsed.publication === 'published' &&
    showPrice &&
    priceCents === null
  )
    throw new Error('Informe o preço ou escolha exibir preço sob consulta.');
  const optionPrices = options.map((option, index) => {
    let price;
    try {
      price = parseMoney(option.price);
    } catch {
      throw new Error(`Confira o preço da opção ${index + 1}. Informe um preço válido.`);
    }
    if (parsed.publication === 'published' && option.showPrice && price === null)
      throw new Error(`Informe o preço da opção ${index + 1} ou marque o valor sob consulta.`);
    return price;
  });
  const productId = id ?? randomUUID();
  let removed: (typeof media.$inferSelect)[] = [];
  await db.transaction(async (tx) => {
    const existing = id
      ? (await tx.select().from(products).where(eq(products.id, id)).for('update'))[0]
      : null;
    if (id && !existing) throw new Error('Produto não encontrado.');
    const previousVariants = await tx
      .select()
      .from(variants)
      .where(eq(variants.productId, productId))
      .orderBy(asc(variants.position));
    if (
      parsed.mode === 'standard' &&
      existing?.mode === 'photo_variants' &&
      previousVariants.length > 1
    )
      throw new Error(
        'Mantenha o modo por foto enquanto houver várias opções com preços próprios.'
      );
    if (
      options.some(
        (option) => option.id && !previousVariants.some((variant) => variant.id === option.id)
      )
    )
      throw new Error('Uma das opções não pertence a este produto. Atualize a página.');
    const selectedMedia = parsed.mediaIds.length
      ? await tx.select().from(media).where(inArray(media.id, parsed.mediaIds)).for('update')
      : [];
    if (
      selectedMedia.length !== parsed.mediaIds.length ||
      selectedMedia.some(
        (image) =>
          image.productId !== productId && (image.productId !== null || image.ownerId !== ownerId)
      )
    )
      throw new Error('Uma das fotos não está disponível. Envie-a novamente.');
    const categoryIds = [...new Set(parsed.categoryIds)];
    const selectedCategories = categoryIds.length
      ? await tx.select().from(categories).where(inArray(categories.id, categoryIds))
      : [];
    if (selectedCategories.length !== categoryIds.length)
      throw new Error('Uma categoria não está disponível. Atualize a página.');
    const previousMedia = await tx.select().from(media).where(eq(media.productId, productId));
    removed = previousMedia.filter((image) => !parsed.mediaIds.includes(image.id));
    const productValues = {
      name: parsed.name,
      description: parsed.description,
      mode: parsed.mode,
      publication: parsed.publication,
      featured: form.get('featured') === 'on',
      updatedAt: new Date()
    };
    if (existing) await tx.update(products).set(productValues).where(eq(products.id, productId));
    else
      await tx
        .insert(products)
        .values({
          id: productId,
          slug: `${slugify(parsed.name)}-${productId.slice(0, 6)}`,
          ...productValues
        });
    const nextVariants =
      parsed.mode === 'photo_variants'
        ? options.map((option, position) => {
            const previous =
              previousVariants.find((variant) => variant.id === option.id) ??
              (existing?.mode === 'standard' && position === 0 ? previousVariants[0] : undefined);
            const variantId = previous?.id ?? randomUUID();
            return {
              id: variantId,
              productId,
              imageId: option.imageId,
              position,
              name:
                option.name ||
                (existing?.mode === 'photo_variants' ? previous?.name : '') ||
                `Opção ${position + 1}`,
              sku:
                option.sku ||
                previous?.sku ||
                `FC-${variantId.replaceAll('-', '').slice(0, 12).toUpperCase()}`,
              priceCents: optionPrices[position]!,
              showPrice: option.showPrice,
              availability: option.availability
            };
          })
        : [
            {
              id: previousVariants[0]?.id ?? randomUUID(),
              productId,
              imageId: null,
              position: 0,
              name: 'Padrão',
              sku:
                parsed.sku ||
                previousVariants[0]?.sku ||
                `FC-${productId.slice(0, 8).toUpperCase()}`,
              priceCents,
              showPrice,
              availability: parsed.availability
            }
          ];
    if (new Set(nextVariants.map((variant) => variant.sku)).size !== nextVariants.length)
      throw new Error('Cada opção precisa de uma referência diferente.');
    const retained = new Set(nextVariants.map((variant) => variant.id));
    const deletedVariants = previousVariants.filter((variant) => !retained.has(variant.id));
    if (deletedVariants.length)
      await tx.delete(variants).where(
        inArray(
          variants.id,
          deletedVariants.map((variant) => variant.id)
        )
      );
    for (const variant of nextVariants) {
      if (previousVariants.some((previous) => previous.id === variant.id))
        await tx.update(variants).set(variant).where(eq(variants.id, variant.id));
      else await tx.insert(variants).values(variant);
    }
    await tx.delete(productCategories).where(eq(productCategories.productId, productId));
    if (categoryIds.length)
      await tx
        .insert(productCategories)
        .values(categoryIds.map((categoryId) => ({ productId, categoryId })));
    if (removed.length)
      await tx.delete(media).where(
        inArray(
          media.id,
          removed.map((image) => image.id)
        )
      );
    for (const [position, mediaId] of parsed.mediaIds.entries())
      await tx
        .update(media)
        .set({ productId, position, alt: parsed.name })
        .where(eq(media.id, mediaId));
  });
  await removeFiles(removed.map((image) => image.storageKey));
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
