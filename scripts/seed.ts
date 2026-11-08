import { db, pool } from '../src/lib/server/db/index';
import {
  products,
  variants,
  categories,
  productCategories,
  media,
  siteSettings
} from '../src/lib/server/db/schema';
import { defaultHours } from '../src/lib/domain';
import { and, eq } from 'drizzle-orm';
import { storeDemoProducts } from './store-demo-products';
const refreshDemo = process.argv.includes('--refresh-demo');
const mode = process.argv[process.argv.indexOf('--mode') + 1] ?? 'empty';
if (!['demo', 'e2e', 'empty'].includes(mode)) throw new Error('Modo de seed inválido.');
if (
  mode === 'e2e' &&
  (process.env.APP_ENV !== 'e2e' || !process.env.DATABASE_URL?.includes('flora_e2e'))
)
  throw new Error('Seed E2E exige banco e ambiente exclusivos.');
try {
  const [existing] = await db.select().from(siteSettings).limit(1);
  if (
    refreshDemo &&
    (mode !== 'demo' ||
      !existing?.demo ||
      process.env.APP_ENV === 'e2e' ||
      process.env.DATABASE_URL?.includes('flora_e2e'))
  ) {
    throw new Error('Atualização exige uma loja de demonstração, fora do ambiente E2E.');
  }
  if (existing && mode !== 'e2e' && !refreshDemo) {
    console.log('Loja já configurada; nenhum conteúdo foi sobrescrito.');
    process.exitCode = 0;
  } else {
    await db.transaction(async (tx) => {
      await tx
        .insert(siteSettings)
        .values({
          id: 'main',
          shopName: 'Flor de Cacau',
          whatsapp: mode === 'e2e' ? '5531999990000' : '5531992381170',
          address: 'Rua Estados Unidos, 358 · Nações Unidas · Sabará/MG',
          postalCode: '34590-290',
          mapUrl:
            'https://www.google.com/maps/search/?api=1&query=Floricultura+Flor+de+Cacau+Sabará',
          heroTitle: 'Carinho que floresce em cada detalhe.',
          heroText:
            'Flores, cestas e presentes para celebrar, agradecer e transformar um dia comum em um momento especial.',
          aboutTitle: 'De Sabará, com carinho.',
          aboutText:
            'Na Flor de Cacau, flores e presentes ajudam a transformar carinho em gestos especiais. Em Sabará, oferecemos buquês, arranjos e cestas para celebrar, agradecer ou surpreender alguém.\n\nCada pedido começa com uma conversa. Pelo WhatsApp, ajudamos você a escolher uma opção para a ocasião e combinamos os detalhes com atenção e cuidado.',
          deliveryNote: 'Entregas sob consulta. A taxa será combinada pelo WhatsApp.',
          weeklyHours: defaultHours,
          cardEnabled: false,
          cardPriceCents: null,
          demo: mode !== 'empty'
        })
        .onConflictDoNothing();
      const names = ['Buquês', 'Arranjos', 'Flores', 'Cestas', 'Presentes'];
      const slugs = ['buques', 'arranjos', 'flores', 'cestas', 'presentes'];
      for (const [position, name] of names.entries())
        await tx
          .insert(categories)
          .values({ id: `cat-${position}`, name, slug: slugs[position]!, position })
          .onConflictDoNothing();
      if (mode === 'empty') return;
      const fixtureItems = [
        {
          id: 'rosas',
          name: 'Buquê de Rosas',
          price: 14990,
          image: 'rosas-vermelhas.jpg',
          cats: [0, 2],
          description:
            'Rosas vermelhas em um buquê cheio de significado. Um gesto clássico para celebrar o amor e os momentos especiais.',
          state: 'available',
          featured: true
        },
        {
          id: 'delicadeza',
          name: 'Buquê Delicadeza',
          price: 12990,
          image: 'rosas-rosas.jpg',
          cats: [0, 4],
          description:
            'Tons suaves e uma composição delicada para levar leveza ao dia de quem você ama.',
          state: 'available',
          featured: true
        },
        {
          id: 'girassois',
          name: 'Alegria em Girassóis',
          price: 8990,
          image: 'girassois.jpg',
          cats: [1, 2],
          description: 'A energia dos girassóis em uma composição acolhedora e cheia de vida.',
          state: 'available',
          featured: true
        },
        {
          id: 'tulipas',
          name: 'Encanto de Tulipas',
          price: 73891,
          image: 'tulipas-rosas.jpg',
          cats: [0, 2],
          description:
            'Tulipas delicadas para um presente singular. Consulte as cores e a disponibilidade da estação.',
          state: 'on_request',
          featured: true,
          hiddenPrice: true
        },
        {
          id: 'jardim',
          name: 'Jardim de Cores',
          price: 11990,
          image: 'tulipas-coloridas.jpg',
          cats: [1, 2],
          description:
            'Uma seleção de flores em cores vibrantes. Consulte as opções disponíveis para a sua ocasião.',
          state: 'check'
        },
        {
          id: 'cesta',
          name: 'Cesta de Carinho',
          price: 18990,
          image: 'cesta-floral.jpg',
          cats: [3, 4],
          description: 'Uma cesta floral para transformar a surpresa em uma lembrança afetuosa.',
          state: 'unavailable'
        },
        ...(mode === 'e2e'
          ? [
              {
                id: 'oculto',
                name: 'Produto Oculto',
                price: 5590,
                image: 'rosas-vermelhas.jpg',
                cats: [0],
                description: 'Produto oculto de teste.',
                state: 'available',
                hidden: true
              },
              {
                id: 'rascunho',
                name: 'Produto Rascunho',
                price: 5990,
                image: 'rosas-vermelhas.jpg',
                cats: [0],
                description: 'Rascunho de teste.',
                state: 'available',
                draft: true
              }
            ]
          : [])
      ];
      if (refreshDemo) {
        // Oculta somente exemplos antigos ainda com seus dados originais. Nunca apaga produtos.
        for (const item of fixtureItems.filter(
          (item) => !('hidden' in item) && !('draft' in item)
        )) {
          const [original] = await tx
            .select({ product: products, variant: variants, image: media })
            .from(products)
            .innerJoin(variants, eq(variants.productId, products.id))
            .innerJoin(media, eq(media.productId, products.id))
            .where(
              and(eq(products.id, `demo-${item.id}`), eq(media.storageKey, `demo/${item.image}`))
            );
          if (
            original &&
            original.product.name === item.name &&
            original.product.description === item.description &&
            original.product.publication === 'published' &&
            original.product.featured === !!('featured' in item && item.featured) &&
            original.variant.priceCents === item.price &&
            original.variant.availability === item.state &&
            original.variant.showPrice === !('hiddenPrice' in item && item.hiddenPrice)
          ) {
            await tx
              .update(products)
              .set({ publication: 'hidden', updatedAt: new Date() })
              .where(eq(products.id, original.product.id));
          }
        }
      }
      const items = mode === 'demo' ? storeDemoProducts : fixtureItems;
      for (const [position, item] of items.entries()) {
        const inserted = await tx
          .insert(products)
          .values({
            id: `demo-${item.id}`,
            slug: item.id,
            name: item.name,
            description: item.description,
            publication:
              'hidden' in item && item.hidden
                ? 'hidden'
                : 'draft' in item && item.draft
                  ? 'draft'
                  : 'published',
            featured: !!('featured' in item && item.featured),
            createdAt: new Date(2026, 0, 20 - position)
          })
          .onConflictDoNothing()
          .returning({ id: products.id });
        if (!inserted.length) continue;
        await tx
          .insert(variants)
          .values({
            id: `variant-${item.id}`,
            productId: `demo-${item.id}`,
            sku: `FC-${mode === 'demo' ? 'LOJA-' : ''}${String(position + 1).padStart(3, '0')}`,
            priceCents: item.price,
            showPrice: !('hiddenPrice' in item && item.hiddenPrice),
            availability: item.state
          })
          .onConflictDoNothing();
        await tx
          .insert(media)
          .values({
            id: `image-${item.id}`,
            productId: `demo-${item.id}`,
            storageKey: `${mode === 'demo' ? 'demo-loja' : 'demo'}/${item.image}`,
            alt: item.name,
            position: 0
          })
          .onConflictDoNothing();
        for (const cat of item.cats)
          await tx
            .insert(productCategories)
            .values({ productId: `demo-${item.id}`, categoryId: `cat-${cat}` })
            .onConflictDoNothing();
      }
    });
    console.log(`Seed ${mode} concluído.`);
  }
} finally {
  await pool.end();
}
