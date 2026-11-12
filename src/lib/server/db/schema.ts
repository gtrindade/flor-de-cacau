import {
  pgTable,
  text,
  boolean,
  integer,
  timestamp,
  jsonb,
  primaryKey,
  uniqueIndex,
  check,
  index,
  type AnyPgColumn
} from 'drizzle-orm/pg-core';
import { sql } from 'drizzle-orm';
import type { WeeklyHours } from '../../domain';

const dates = {
  createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull()
};
export const user = pgTable('auth_user', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  email: text('email').notNull().unique(),
  emailVerified: boolean('email_verified').default(false).notNull(),
  image: text('image'),
  ...dates
});
export const session = pgTable('auth_session', {
  id: text('id').primaryKey(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  token: text('token').notNull().unique(),
  ...dates,
  ipAddress: text('ip_address'),
  userAgent: text('user_agent'),
  userId: text('user_id')
    .notNull()
    .references(() => user.id, { onDelete: 'cascade' })
});
export const account = pgTable(
  'auth_account',
  {
    id: text('id').primaryKey(),
    accountId: text('account_id').notNull(),
    providerId: text('provider_id').notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => user.id, { onDelete: 'cascade' }),
    accessToken: text('access_token'),
    refreshToken: text('refresh_token'),
    idToken: text('id_token'),
    accessTokenExpiresAt: timestamp('access_token_expires_at', { withTimezone: true }),
    refreshTokenExpiresAt: timestamp('refresh_token_expires_at', { withTimezone: true }),
    scope: text('scope'),
    password: text('password'),
    ...dates
  },
  (t) => [uniqueIndex('account_provider_identity').on(t.providerId, t.accountId)]
);
export const verification = pgTable('auth_verification', {
  id: text('id').primaryKey(),
  identifier: text('identifier').notNull(),
  value: text('value').notNull(),
  expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
  ...dates
});
export const products = pgTable(
  'products',
  {
    id: text('id').primaryKey(),
    slug: text('slug').notNull().unique(),
    name: text('name').notNull(),
    description: text('description').notNull().default(''),
    publication: text('publication').notNull().default('draft'),
    featured: boolean('featured').notNull().default(false),
    mode: text('mode').notNull().default('standard'),
    ...dates
  },
  (t) => [
    check('publication_values', sql`${t.publication} in ('draft','published','hidden')`),
    check('product_mode_values', sql`${t.mode} in ('standard','photo_variants')`)
  ]
);
export const variants = pgTable(
  'variants',
  {
    id: text('id').primaryKey(),
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    sku: text('sku').notNull().unique(),
    name: text('name').notNull().default('Padrão'),
    imageId: text('image_id').references((): AnyPgColumn => media.id, { onDelete: 'set null' }),
    position: integer('position').notNull().default(0),
    priceCents: integer('price_cents'),
    showPrice: boolean('show_price').notNull().default(true),
    availability: text('availability').notNull().default('available')
  },
  (t) => [
    uniqueIndex('variant_image_unique').on(t.imageId),
    index('variant_product_position').on(t.productId, t.position),
    check('non_negative_price', sql`${t.priceCents} is null or ${t.priceCents} >= 0`),
    check(
      'availability_values',
      sql`${t.availability} in ('available','on_request','check','unavailable')`
    )
  ]
);
export const categories = pgTable('categories', {
  id: text('id').primaryKey(),
  name: text('name').notNull(),
  slug: text('slug').notNull().unique(),
  position: integer('position').notNull().default(0)
});
export const productCategories = pgTable(
  'product_categories',
  {
    productId: text('product_id')
      .notNull()
      .references(() => products.id, { onDelete: 'cascade' }),
    categoryId: text('category_id')
      .notNull()
      .references(() => categories.id, { onDelete: 'cascade' })
  },
  (t) => [primaryKey({ columns: [t.productId, t.categoryId] })]
);
export const media = pgTable('media', {
  id: text('id').primaryKey(),
  productId: text('product_id').references(() => products.id, { onDelete: 'cascade' }),
  ownerId: text('owner_id').references(() => user.id, { onDelete: 'set null' }),
  type: text('type').notNull().default('image'),
  storageKey: text('storage_key').notNull(),
  alt: text('alt').notNull().default(''),
  width: integer('width'),
  height: integer('height'),
  position: integer('position').notNull().default(0),
  ...dates
});
export const siteSettings = pgTable(
  'site_settings',
  {
    id: text('id').primaryKey().default('main'),
    shopName: text('shop_name').notNull(),
    whatsapp: text('whatsapp').notNull(),
    address: text('address').notNull(),
    postalCode: text('postal_code').notNull(),
    mapUrl: text('map_url').notNull(),
    heroTitle: text('hero_title').notNull(),
    heroText: text('hero_text').notNull(),
    aboutTitle: text('about_title').notNull(),
    aboutText: text('about_text').notNull(),
    aboutImageId: text('about_image_id').references(() => media.id, { onDelete: 'set null' }),
    deliveryNote: text('delivery_note').notNull(),
    weeklyHours: jsonb('weekly_hours').$type<WeeklyHours>().notNull(),
    cardEnabled: boolean('card_enabled').notNull().default(false),
    cardPriceCents: integer('card_price_cents'),
    demo: boolean('demo').notNull().default(false),
    ...dates
  },
  (t) => [
    check('card_price_non_negative', sql`${t.cardPriceCents} is null or ${t.cardPriceCents} >= 0`)
  ]
);
