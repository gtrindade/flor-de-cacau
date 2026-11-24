import { createHash, randomUUID } from 'node:crypto';
import { asc, eq, inArray } from 'drizzle-orm';
import { z } from 'zod';
import { db } from './db';
import {
  categories,
  media,
  productAliases,
  productCategories,
  products,
  variants
} from './db/schema';
import { parseMoney, slugify } from '../domain';

type Transaction = Parameters<Parameters<typeof db.transaction>[0]>[0];
const publication = z.enum(['draft', 'published', 'hidden']);
const availability = z.enum(['available', 'on_request', 'check', 'unavailable']);
const batchItem = z.object({
  imageId: z.string().min(1).max(120),
  name: z.string().trim().max(180).default(''),
  description: z.string().max(6000).default(''),
  price: z.string().max(40),
  showPrice: z.boolean(),
  availability
});

function productIdentity(name: string) {
  const id = randomUUID();
  return { id, slug: `${slugify(name)}-${id.slice(0, 8)}` };
}
function validatePublication(
  value: string,
  options: { showPrice: boolean; priceCents: number | null }[]
) {
  if (
    value === 'published' &&
    options.some((option) => option.showPrice && option.priceCents === null)
  )
    throw new Error('Informe os preços ou escolha preço sob consulta antes de publicar.');
}

export async function createBatchProducts(form: FormData, ownerId: string) {
  const visibility = publication.parse(form.get('publication') ?? 'draft');
  const items = z
    .array(batchItem)
    .min(1, 'Escolha pelo menos uma foto.')
    .parse(JSON.parse(String(form.get('items') ?? '[]')));
  const imageIds = items.map((item) => item.imageId);
  const submittedMedia = z
    .array(z.string())
    .parse(JSON.parse(String(form.get('mediaIds') ?? '[]')));
  if (
    new Set(imageIds).size !== items.length ||
    JSON.stringify(imageIds) !== JSON.stringify(submittedMedia)
  )
    throw new Error('Confira as fotos do lote antes de salvar.');
  const categoryIds = [...new Set(z.array(z.string()).max(30).parse(form.getAll('categoryIds')))];
  const prepared = items.map((item, index) => {
    let priceCents;
    try {
      priceCents = parseMoney(item.price);
    } catch {
      throw new Error(`Confira o preço do produto ${index + 1}.`);
    }
    const name = item.name || `Opção ${index + 1}`;
    const variantId = randomUUID();
    return { ...item, name, priceCents, product: productIdentity(name), variantId };
  });
  validatePublication(visibility, prepared);
  await db.transaction(async (tx) => {
    const images = await tx
      .select()
      .from(media)
      .where(inArray(media.id, imageIds))
      .orderBy(asc(media.id))
      .for('update');
    if (
      images.length !== imageIds.length ||
      images.some((image) => image.productId !== null || image.ownerId !== ownerId)
    )
      throw new Error(
        'Uma foto não está disponível ou já foi cadastrada. Confira a lista de produtos antes de tentar novamente.'
      );
    if (
      categoryIds.length &&
      (await tx.select().from(categories).where(inArray(categories.id, categoryIds))).length !==
        categoryIds.length
    )
      throw new Error('Uma categoria não está disponível. Atualize a página.');
    for (const item of prepared) {
      await tx.insert(products).values({
        ...item.product,
        name: item.name,
        description: item.description,
        publication: visibility,
        mode: 'standard'
      });
      await tx.insert(variants).values({
        id: item.variantId,
        productId: item.product.id,
        sku: `FC-${item.variantId.replaceAll('-', '').slice(0, 12).toUpperCase()}`,
        priceCents: item.priceCents,
        showPrice: item.showPrice,
        availability: item.availability
      });
      await tx
        .update(media)
        .set({ productId: item.product.id, variantId: item.variantId, position: 0, alt: item.name })
        .where(eq(media.id, item.imageId));
      if (categoryIds.length)
        await tx
          .insert(productCategories)
          .values(categoryIds.map((categoryId) => ({ productId: item.product.id, categoryId })));
    }
  });
  return prepared.map((item) => item.product.id);
}

async function readBundle(tx: Transaction, productId: string) {
  const [product] = await tx
    .select()
    .from(products)
    .where(eq(products.id, productId))
    .for('update');
  if (!product) throw new Error('Produto não encontrado. Atualize a lista e tente novamente.');
  const options = await tx
    .select()
    .from(variants)
    .where(eq(variants.productId, productId))
    .orderBy(asc(variants.position), asc(variants.id))
    .for('update');
  const images = await tx
    .select()
    .from(media)
    .where(eq(media.productId, productId))
    .orderBy(asc(media.position), asc(media.id))
    .for('update');
  const links = await tx
    .select()
    .from(productCategories)
    .where(eq(productCategories.productId, productId))
    .orderBy(asc(productCategories.categoryId));
  if (!options.length) throw new Error('Este produto não possui opções para reorganizar.');
  return { product, options, images, links };
}
type Bundle = Awaited<ReturnType<typeof readBundle>>;
function optionImages(bundle: Bundle, option: Bundle['options'][number]) {
  return bundle.images.filter(
    (image) =>
      image.variantId === option.id || image.id === option.imageId || bundle.options.length === 1
  );
}
function validateImages(bundle: Bundle) {
  const linked = new Set<string>();
  for (const option of bundle.options) {
    const images = optionImages(bundle, option);
    if (!images.length)
      throw new Error(`Adicione uma foto a “${bundle.product.name}” antes de juntar os produtos.`);
    for (const image of images) {
      if (linked.has(image.id))
        throw new Error(
          'Uma foto está associada a mais de uma opção. Confira o produto antes de continuar.'
        );
      linked.add(image.id);
    }
    if (option.imageId && !images.some((image) => image.id === option.imageId))
      throw new Error('Uma das fotos não pertence ao produto. Confira o cadastro.');
  }
  if (linked.size !== bundle.images.length)
    throw new Error('Há fotos sem opção associada. Confira o produto antes de continuar.');
}
async function keepLinks(tx: Transaction, bundle: Bundle) {
  if (bundle.product.publication === 'published')
    await tx
      .insert(productAliases)
      .values(
        bundle.options.map((option) => ({ sourceSlug: bundle.product.slug, variantId: option.id }))
      )
      .onConflictDoNothing();
}

export async function groupProducts(form: FormData) {
  const ids = z
    .array(z.string().min(1).max(120))
    .min(2, 'Selecione pelo menos dois produtos.')
    .max(500)
    .parse(form.getAll('productIds'));
  if (new Set(ids).size !== ids.length) throw new Error('Selecione cada produto apenas uma vez.');
  const name = z
    .string()
    .trim()
    .min(2, 'Informe o nome do produto agrupado.')
    .max(180)
    .parse(form.get('name'));
  const description = z
    .string()
    .max(6000)
    .parse(form.get('description') ?? '');
  const visibility = publication.parse(form.get('publication'));
  const identity = productIdentity(name);
  await db.transaction(async (tx) => {
    // A stable lock order also prevents two overlapping grouping requests from deadlocking.
    const byId = new Map<string, Bundle>();
    for (const id of [...ids].sort()) byId.set(id, await readBundle(tx, id));
    const bundles = ids.map((id) => byId.get(id)!);
    bundles.forEach(validateImages);
    validatePublication(
      visibility,
      bundles.flatMap((bundle) => bundle.options)
    );
    await tx.insert(products).values({
      ...identity,
      name,
      description,
      mode: 'photo_variants',
      publication: visibility,
      featured: bundles.some((bundle) => bundle.product.featured)
    });
    let position = 0;
    let imagePosition = 0;
    const categoryIds = new Set<string>();
    for (const bundle of bundles) {
      await keepLinks(tx, bundle);
      bundle.links.forEach((link) => categoryIds.add(link.categoryId));
      for (const option of bundle.options) {
        const images = optionImages(bundle, option);
        await tx
          .update(variants)
          .set({
            productId: identity.id,
            name: bundle.product.mode === 'standard' ? bundle.product.name : option.name,
            description: option.description || bundle.product.description,
            imageId: option.imageId ?? images[0]!.id,
            position: position++
          })
          .where(eq(variants.id, option.id));
        for (const image of images)
          await tx
            .update(media)
            .set({ productId: identity.id, variantId: option.id, position: imagePosition++ })
            .where(eq(media.id, image.id));
      }
    }
    if (categoryIds.size)
      await tx
        .insert(productCategories)
        .values([...categoryIds].map((categoryId) => ({ productId: identity.id, categoryId })));
    // Images and variants already belong to the new parent. No files are deleted.
    await tx.delete(products).where(inArray(products.id, ids));
  });
  return identity.id;
}

function fingerprint(bundle: Bundle) {
  return createHash('sha256').update(JSON.stringify(bundle)).digest('hex');
}
function assertSplittable(bundle: Bundle, expectedCount: number) {
  if (
    bundle.product.mode !== 'photo_variants' ||
    bundle.options.length !== expectedCount ||
    expectedCount < 2
  )
    throw new Error('O produto ou a quantidade de opções mudou. Confira o plano antes de separar.');
  validateImages(bundle);
}
export async function planProductSplit(id: string, expectedCount: number) {
  return db.transaction(async (tx) => {
    const bundle = await readBundle(tx, id);
    assertSplittable(bundle, expectedCount);
    return { snapshot: bundle, fingerprint: fingerprint(bundle), count: bundle.options.length };
  });
}
export async function splitProduct(id: string, expectedCount: number, expectedFingerprint: string) {
  return db.transaction(async (tx) => {
    const bundle = await readBundle(tx, id);
    assertSplittable(bundle, expectedCount);
    if (fingerprint(bundle) !== expectedFingerprint)
      throw new Error('O cadastro mudou depois do plano. Gere um novo plano antes de migrar.');
    await keepLinks(tx, bundle);
    const created = [];
    for (const [index, option] of bundle.options.entries()) {
      const name =
        option.name === 'Padrão' || !option.name.trim() ? `Opção ${index + 1}` : option.name;
      const identity = productIdentity(name);
      await tx.insert(products).values({
        ...identity,
        name,
        // A shared group description may describe only some photos. Only carry the option's text.
        description: option.description,
        mode: 'standard',
        publication: bundle.product.publication,
        featured: bundle.product.featured
      });
      const images = optionImages(bundle, option);
      await tx
        .update(variants)
        .set({
          productId: identity.id,
          imageId: null,
          name: 'Padrão',
          description: '',
          position: 0
        })
        .where(eq(variants.id, option.id));
      for (const [position, image] of images.entries())
        await tx
          .update(media)
          .set({ productId: identity.id, variantId: option.id, position })
          .where(eq(media.id, image.id));
      if (bundle.links.length)
        await tx
          .insert(productCategories)
          .values(
            bundle.links.map((link) => ({ productId: identity.id, categoryId: link.categoryId }))
          );
      created.push({ ...identity, name, variantId: option.id, sku: option.sku });
    }
    await tx.delete(products).where(eq(products.id, id));
    return created;
  });
}
