import { and, asc, desc, eq, inArray } from 'drizzle-orm';
import { error } from '@sveltejs/kit';
import { marked } from 'marked';
import sanitizeHtml from 'sanitize-html';
import { db } from './db';
import {
  products,
  variants,
  categories,
  productCategories,
  media,
  siteSettings
} from './db/schema';
import { openingStatus } from '../domain';

const isStaticDemo = (key: string) => key.startsWith('demo/') || key.startsWith('demo-loja/');
export const mediaUrl = (value: { id: string; storageKey: string }) =>
  isStaticDemo(value.storageKey) ? `/${value.storageKey}` : `/media/${value.id}`;
export async function getSettings(internal = false) {
  const [settings] = await db.select().from(siteSettings).where(eq(siteSettings.id, 'main'));
  if (!settings) error(503, 'A loja está sendo preparada. Tente novamente em instantes.');
  const aboutImage = settings.aboutImageId
    ? (await db.select().from(media).where(eq(media.id, settings.aboutImageId)))[0]
    : null;
  const now =
    process.env.APP_ENV === 'e2e' && process.env.E2E_NOW
      ? new Date(process.env.E2E_NOW)
      : new Date();
  return {
    ...settings,
    cardPriceCents: internal || settings.cardEnabled ? settings.cardPriceCents : null,
    aboutImage: aboutImage
      ? { id: aboutImage.id, url: mediaUrl(aboutImage), alt: aboutImage.alt }
      : null,
    aboutHtml: sanitizeHtml(await marked.parse(settings.aboutText), {
      allowedTags: ['p', 'strong', 'em', 'ul', 'ol', 'li', 'br', 'h2', 'h3', 'a'],
      allowedAttributes: { a: ['href', 'title', 'target', 'rel'] },
      allowedSchemes: ['https', 'http'],
      transformTags: {
        a: (tagName, originalAttributes) => {
          const attribs = { ...originalAttributes };
          delete attribs.target;
          delete attribs.rel;
          try {
            const url = new URL(attribs.href ?? '', 'https://flor-de-cacau.invalid');
            if (
              ['http:', 'https:'].includes(url.protocol) &&
              (url.hostname === 'wa.me' ||
                url.hostname === 'whatsapp.com' ||
                url.hostname.endsWith('.whatsapp.com'))
            ) {
              attribs.target = '_blank';
              attribs.rel = 'noopener noreferrer';
            }
          } catch {
            // Sanitization below still handles malformed and unsupported hrefs.
          }
          return { tagName, attribs };
        }
      }
    }),
    opening: openingStatus(settings.weeklyHours, now)
  };
}
export async function getCategories() {
  return db.select().from(categories).orderBy(asc(categories.position), asc(categories.name));
}
export async function getProducts(internal = false) {
  const rows = await db
    .select({ product: products, variant: variants })
    .from(products)
    .innerJoin(variants, eq(variants.productId, products.id))
    .where(internal ? undefined : eq(products.publication, 'published'))
    .orderBy(desc(products.createdAt));
  if (!rows.length) return [];
  const ids = rows.map((r) => r.product.id);
  const [images, links] = await Promise.all([
    db.select().from(media).where(inArray(media.productId, ids)).orderBy(asc(media.position)),
    db
      .select({ productId: productCategories.productId, category: categories })
      .from(productCategories)
      .innerJoin(categories, eq(productCategories.categoryId, categories.id))
      .where(inArray(productCategories.productId, ids))
  ]);
  return rows.map(({ product, variant }) => ({
    id: product.id,
    slug: product.slug,
    name: product.name,
    description: product.description,
    publication: product.publication,
    featured: product.featured,
    variant: {
      id: variant.id,
      sku: variant.sku,
      name: variant.name,
      priceCents: internal || variant.showPrice ? variant.priceCents : null,
      showPrice: variant.showPrice,
      availability: variant.availability
    },
    categories: links.filter((l) => l.productId === product.id).map((l) => l.category),
    images: images
      .filter((m) => m.productId === product.id)
      .map((m) => ({ id: m.id, url: mediaUrl(m), alt: m.alt || product.name }))
  }));
}
export type Product = Awaited<ReturnType<typeof getProducts>>[number];
export type Settings = Awaited<ReturnType<typeof getSettings>>;
export async function getProduct(slugOrId: string, internal = false) {
  const all = await getProducts(internal);
  const product = all.find((p) => (internal ? p.id === slugOrId : p.slug === slugOrId));
  if (!product) error(404, 'Produto não encontrado.');
  return product;
}
export async function getAccessibleMedia(id: string, admin: boolean) {
  const [image] = await db.select().from(media).where(eq(media.id, id));
  if (!image || isStaticDemo(image.storageKey)) error(404);
  if (!admin) {
    const visible = image.productId
      ? await db
          .select({ id: products.id })
          .from(products)
          .where(and(eq(products.id, image.productId), eq(products.publication, 'published')))
      : await db
          .select({ id: siteSettings.id })
          .from(siteSettings)
          .where(eq(siteSettings.aboutImageId, id));
    if (!visible.length) error(404);
  }
  return image;
}
