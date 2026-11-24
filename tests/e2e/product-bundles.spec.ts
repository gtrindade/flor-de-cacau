import { test, expect, type Page, type APIRequestContext } from '@playwright/test';
import { Pool } from 'pg';
import { readFile, mkdtemp, stat, rm } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import os from 'node:os';
import path from 'node:path';
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const headers = { origin: process.env.BASE_URL!, accept: 'text/html' };
const execute = promisify(execFile);
const created = new Set<string>();
test.beforeAll(() => {
  if (process.env.APP_ENV !== 'e2e' || !process.env.DATABASE_URL?.endsWith('/flora_e2e'))
    throw new Error('Requires isolated E2E database.');
});
test.afterAll(async () => pool.end());
test.beforeEach(async ({ page, context }) => {
  created.clear();
  const errors: string[] = [];
  page.on('pageerror', (error) => errors.push(error.message));
  (page as Page & { errors: string[] }).errors = errors;
  await page.clock.setFixedTime(new Date('2026-11-04T15:00:00Z'));
  await context.route('https://wa.me/**', (route) =>
    route.fulfill({ status: 200, body: 'Conversa simulada' })
  );
  const state = JSON.parse(
    await readFile(path.join(process.env.TEST_AUTH_DIR!, 'admin.json'), 'utf8')
  );
  await context.addCookies(state.cookies);
});
test.afterEach(async ({ page }) => {
  for (const id of created) {
    const [row] = (await pool.query('SELECT name FROM products WHERE id=$1', [id])).rows;
    if (row) {
      const result = await page.request.post('/admin?/delete', {
        form: { id, confirmation: row.name },
        headers,
        maxRedirects: 0
      });
      expect(result.status(), 'Cleanup must remove only products created by this test').toBe(200);
    }
  }
  expect((page as Page & { errors: string[] }).errors).toEqual([]);
});
async function upload(api: APIRequestContext) {
  const response = await api.post('/admin/upload', {
    multipart: {
      file: {
        name: 'orquidea.webp',
        mimeType: 'image/webp',
        buffer: await readFile('static/demo-loja/orquidea-branca.webp')
      }
    },
    headers
  });
  expect(response.status()).toBe(200);
  return response.json();
}
async function product(id: string) {
  const [p] = (await pool.query('SELECT * FROM products WHERE id=$1', [id])).rows;
  const options = (
    await pool.query('SELECT * FROM variants WHERE product_id=$1 ORDER BY position,id', [id])
  ).rows;
  const images = (
    await pool.query('SELECT * FROM media WHERE product_id=$1 ORDER BY position,id', [id])
  ).rows;
  return { ...p, options, images };
}
async function create(
  page: Page,
  name: string,
  overrides: Record<string, string> = {},
  photos = 1
) {
  const media = [];
  for (let i = 0; i < photos; i++) media.push(await upload(page.request));
  const form = {
    name,
    description: '',
    mode: 'standard',
    publication: 'published',
    price: '90,50',
    showPrice: 'on',
    availability: 'available',
    mediaIds: JSON.stringify(media.map((image) => image.id)),
    ...overrides
  };
  if (form.mode === 'photo_variants')
    form['variants' as keyof typeof form] = JSON.stringify(
      media.map((image, index) => ({
        id: '',
        imageId: image.id,
        name: `Opção ${index + 1}`,
        description: '',
        sku: '',
        price: String(90 + index),
        showPrice: index !== 1,
        availability: index === 2 ? 'unavailable' : 'available'
      }))
    );
  const response = await page.request.post('/admin/produtos/novo', {
    form,
    headers,
    maxRedirects: 0
  });
  expect(response.status()).toBe(303);
  const id = response.headers().location!.split('/').pop()!.split('?')[0]!;
  created.add(id);
  return product(id);
}
async function group(
  api: APIRequestContext,
  ids: string[],
  name: string,
  publication = 'published'
) {
  const form = new URLSearchParams({ name, description: '', publication });
  ids.forEach((id) => form.append('productIds', id));
  const response = await api.post('/admin?/group', {
    data: form.toString(),
    headers: { ...headers, 'content-type': 'application/x-www-form-urlencoded' },
    maxRedirects: 0
  });
  if (response.status() === 303 && response.headers().location?.startsWith('/admin/produtos/'))
    created.add(response.headers().location!.split('/').pop()!.split('?')[0]!);
  return response;
}
async function mergeUI(page: Page, ids: string[], name: string) {
  await page.goto('/admin');
  await expect(page.getByRole('button', { name: 'Juntar selecionados' })).toBeDisabled();
  for (const id of ids) await page.locator(`input[type=checkbox][value="${id}"]`).check();
  await page.getByRole('button', { name: 'Juntar selecionados' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  await page.getByLabel('Nome do produto agrupado').fill(name);
  const response = page.waitForResponse(
    (r) => r.request().method() === 'POST' && r.url().includes('?/group')
  );
  await page.getByRole('button', { name: `Juntar ${ids.length} produtos`, exact: true }).click();
  await response;
  await expect(page).toHaveURL(/\/admin\/produtos\/[^/]+\?agrupado=1/);
  const id = new URL(page.url()).pathname.split('/').pop()!;
  created.add(id);
  return product(id);
}
async function order(api: APIRequestContext, slug: string, variantId: string) {
  return api.post(`/produtos/${slug}?/solicitar`, {
    form: { variantId, period: 'combinar', delivery: 'pickup' },
    headers,
    maxRedirects: 0
  });
}
async function readable(page: Page) {
  const metrics = await page.evaluate(() => ({
    overflow: document.documentElement.scrollWidth - innerWidth,
    fields: [...document.querySelectorAll('input,select,textarea')]
      .filter(
        (el) =>
          el.getClientRects().length &&
          !el.matches('[type=hidden],[type=file],[type=checkbox],[type=radio]')
      )
      .filter((el) => parseFloat(getComputedStyle(el).fontSize) < 16)
      .map((el) => el.id)
  }));
  expect(metrics.overflow).toBeLessThanOrEqual(1);
  expect(metrics.fields).toEqual([]);
}

test('cadastro em lote cria onze produtos independentes e permite juntar pela UI', async ({
  page,
  request
}, info) => {
  test.setTimeout(120_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/admin');
  await page.getByRole('link', { name: 'Cadastro em lote' }).click();
  const buffer = await readFile('static/demo-loja/orquidea-branca.webp');
  const files = Array.from({ length: 10 }, (_, i) => ({
    name: `flor-${i}.webp`,
    mimeType: 'image/webp',
    buffer
  }));
  await page.getByLabel('Escolher fotos', { exact: true }).setInputFiles(files);
  const rows = page.getByTestId('photo-option-editor');
  await expect(rows).toHaveCount(10);
  for (let i = 0; i < 10; i++)
    await rows
      .nth(i)
      .getByLabel('Preço (R$)', { exact: true })
      .fill(`${100 + i},90`);
  await expect(page.locator('.upload-photo.pending')).toHaveCount(0);
  await page
    .getByLabel('Escolher fotos', { exact: true })
    .setInputFiles({ name: 'extra.webp', mimeType: 'image/webp', buffer });
  await expect(rows).toHaveCount(11);
  await rows.nth(10).getByLabel('Preço (R$)', { exact: true }).fill('150');
  await rows
    .nth(0)
    .getByLabel('Nome do produto', { exact: true })
    .fill(`Orquídea do lote ${info.project.name}`);
  await rows
    .nth(0)
    .getByLabel('Descrição (opcional)', { exact: true })
    .fill('Orquídea branca em vaso.');
  await rows.nth(1).getByLabel('Nome do produto', { exact: true }).fill('');
  await rows.nth(1).getByLabel('Exibir preço no catálogo').uncheck();
  await rows.nth(2).getByLabel('Disponibilidade', { exact: true }).selectOption('unavailable');
  await page.getByLabel('Mover foto 1 para depois').click();
  await expect(rows.nth(1).getByLabel('Preço (R$)', { exact: true })).toHaveValue('100,90');
  await page.getByLabel('Visibilidade dos produtos').selectOption('published');
  await page.getByLabel('Buquês', { exact: true }).check();
  await expect(page.getByRole('button', { name: 'Salvar 11 produtos', exact: true })).toBeEnabled();
  await readable(page);
  await rows.first().screenshot({ path: info.outputPath('lote-mobile.png') });
  const imageIds = JSON.parse(await page.locator('input[name=mediaIds]').inputValue());
  const save = page.waitForResponse(
    (r) => r.request().method() === 'POST' && new URL(r.url()).pathname === '/admin/produtos/lote'
  );
  await page.getByRole('button', { name: 'Salvar 11 produtos', exact: true }).click();
  await save;
  await expect(page).toHaveURL(/\/admin\?lote=11/);
  const ids = (
    await pool.query('SELECT DISTINCT product_id FROM media WHERE id=ANY($1::text[])', [imageIds])
  ).rows.map((row) => row.product_id as string);
  ids.forEach((id) => created.add(id));
  expect(ids).toHaveLength(11);
  const products = await Promise.all(ids.map(product));
  for (const p of products) {
    expect(p.mode).toBe('standard');
    expect(p.options).toHaveLength(1);
    expect(p.images).toHaveLength(1);
    expect(p.publication).toBe('published');
    expect(
      (await pool.query('SELECT * FROM product_categories WHERE product_id=$1', [p.id])).rowCount
    ).toBe(1);
  }
  const a = products.find((p) => p.description)!;
  const b = products.find((p) => !p.options[0].show_price)!;
  expect(b.name).toBe('Opção 1');
  expect(b.description).toBe('');
  expect(b.options[0].price_cents).toBe(10190);
  const msg = await order(request, a.slug, a.options[0].id);
  expect(msg.status()).toBe(303);
  expect(new URL(msg.headers().location!).searchParams.get('text')).toContain(a.options[0].sku);
  const grouped = await mergeUI(page, [a.id, b.id], `Orquídeas reunidas ${info.project.name}`);
  expect(grouped.options.map((o: any) => o.id).sort()).toEqual(
    [a.options[0].id, b.options[0].id].sort()
  );
  expect(grouped.images).toHaveLength(2);
  expect(grouped.options.find((o: any) => o.id === a.options[0].id).description).toBe(
    a.description
  );
  await page.goto('/admin');
  await readable(page);
  await page.evaluate(() => window.scrollTo(0, 0));
  await page.screenshot({ path: info.outputPath('selecao-mobile.png'), fullPage: true });
  await page.getByLabel('Selecionar todos os produtos').check();
  await page.getByRole('button', { name: 'Juntar selecionados' }).click();
  await readable(page);
  await page.getByRole('dialog').screenshot({ path: info.outputPath('agrupar-mobile.png') });
  await page.getByRole('button', { name: 'Cancelar', exact: true }).click();
  await page.getByLabel('Selecionar todos os produtos').uncheck();
  await expect(page.getByRole('button', { name: 'Juntar selecionados' })).toBeDisabled();
  const old = await request.get(`/produtos/${a.slug}`, { maxRedirects: 0 });
  expect(old.status()).toBe(308);
  expect(old.headers().location).toBe(`/produtos/${grouped.slug}?opcao=${a.options[0].id}`);
  const privatePage = await request.get(`/produtos/${grouped.slug}?opcao=${b.options[0].id}`);
  expect(await privatePage.text()).not.toMatch(/(?<![\w-])10190(?![\w-])/);
});

test('lote e agrupamento rejeitam acessos e falhas sem criar produtos parciais', async ({
  page,
  request
}, info) => {
  const image = await upload(page.request);
  const item = {
    imageId: image.id,
    name: `Lote seguro ${info.project.name}`,
    description: '',
    price: '100',
    showPrice: true,
    availability: 'available'
  };
  const batch = (items: any[], extra: Record<string, string> = {}) => ({
    items: JSON.stringify(items),
    mediaIds: JSON.stringify(items.map((i) => i.imageId)),
    publication: 'published',
    ...extra
  });
  const count = Number((await pool.query('SELECT count(*) FROM products')).rows[0].count);
  for (const form of [
    batch([item, { ...item, price: 'inválido' }]),
    batch([{ ...item, price: '' }]),
    batch([item], { categoryIds: 'missing-category' })
  ]) {
    expect(
      (await page.request.post('/admin/produtos/lote', { form, headers, maxRedirects: 0 })).status()
    ).toBe(400);
    expect(Number((await pool.query('SELECT count(*) FROM products')).rows[0].count)).toBe(count);
    expect(
      (await pool.query('SELECT product_id FROM media WHERE id=$1', [image.id])).rows[0].product_id
    ).toBe(null);
  }
  expect(
    (
      await request.post('/admin/produtos/lote', { form: batch([item]), headers, maxRedirects: 0 })
    ).status()
  ).toBe(303);
  expect((await group(request, ['one', 'two'], 'Sem acesso')).headers().location).toBe('/entrar');
  const outsiderState = JSON.parse(
    await readFile(path.join(process.env.TEST_AUTH_DIR!, 'outsider.json'), 'utf8')
  );
  const outsider = await page
    .context()
    .browser()!
    .newContext({ baseURL: process.env.BASE_URL, storageState: outsiderState });
  expect(
    (
      await outsider.request.post('/admin/produtos/lote', {
        form: batch([item]),
        headers,
        maxRedirects: 0
      })
    ).status()
  ).toBe(403);
  expect((await group(outsider.request, ['one', 'two'], 'Sem acesso')).status()).toBe(403);
  await outsider.close();
  const second = await upload(page.request);
  const bad = [item, { ...item, imageId: second.id, price: 'inválido' }];
  expect(
    (
      await page.request.post('/admin/produtos/lote', {
        form: batch(bad),
        headers,
        maxRedirects: 0
      })
    ).status()
  ).toBe(400);
  expect(Number((await pool.query('SELECT count(*) FROM products')).rows[0].count)).toBe(count);
  const attempts = await Promise.all(
    [1, 2].map(() =>
      page.request.post('/admin/produtos/lote', { form: batch([item]), headers, maxRedirects: 0 })
    )
  );
  expect(attempts.map((r) => r.status()).sort()).toEqual([303, 400]);
  const id = (await pool.query('SELECT product_id FROM media WHERE id=$1', [image.id])).rows[0]
    .product_id;
  created.add(id);
  const a = await product(id);
  const b = await create(page, `Sem foto ${info.project.name}`, { mediaIds: '[]' });
  for (const ids of [
    [a.id, b.id],
    [a.id, 'missing-product'],
    [a.id, a.id]
  ]) {
    expect((await group(page.request, ids, 'Não deve existir')).status()).toBe(400);
    expect((await product(a.id)).options[0].id).toBe(a.options[0].id);
    expect((await product(b.id)).id).toBe(b.id);
  }
  expect((await request.get(`/media/${image.id}`)).status()).toBe(200);
});

test('agrupar preserva galerias, descrições e referências ao editar ou ocultar opções', async ({
  page,
  request
}, info) => {
  const a = await create(
    page,
    `Arranjo com galeria ${info.project.name}`,
    { description: 'Arranjo com flores brancas.', categoryIds: 'cat-0', featured: 'on' },
    3
  );
  const b = await create(
    page,
    `Cesta especial ${info.project.name}`,
    { showPrice: '', price: '299,95', availability: 'unavailable', categoryIds: 'cat-3' },
    2
  );
  const response = await group(
    page.request,
    [a.id, b.id],
    `Grupo com galerias ${info.project.name}`
  );
  expect(response.status()).toBe(303);
  const id = response.headers().location!.split('/').pop()!.split('?')[0]!;
  let p = await product(id);
  expect(p.images).toHaveLength(5);
  expect(p.featured).toBe(true);
  expect(
    (
      await pool.query(
        'SELECT category_id FROM product_categories WHERE product_id=$1 ORDER BY category_id',
        [id]
      )
    ).rows.map((row) => row.category_id)
  ).toEqual(['cat-0', 'cat-3']);
  expect(p.options.map((o: any) => o.sku).sort()).toEqual(
    [a.options[0].sku, b.options[0].sku].sort()
  );
  expect(
    (await pool.query('SELECT id FROM products WHERE id=ANY($1::text[])', [[a.id, b.id]])).rowCount
  ).toBe(0);
  await page.goto(`/admin/produtos/${id}`);
  await expect(page.getByTestId('photo-option-editor')).toHaveCount(2);
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.locator('p.success')).toBeVisible();
  p = await product(id);
  expect(p.images).toHaveLength(5);
  expect(p.options.find((o: any) => o.id === a.options[0].id).description).toBe(a.description);
  await page.goto(`/produtos/${p.slug}?opcao=${a.options[0].id}`);
  await expect(page.locator('.gallery-thumbs button')).toHaveCount(3);
  await expect(page.locator('.detail-description')).toContainText(a.description);
  const message = await order(request, p.slug, a.options[0].id);
  expect(message.status()).toBe(303);
  const text = new URL(message.headers().location!).searchParams.get('text')!;
  expect(text).toContain(a.options[0].sku);
  expect(text).toContain(`?opcao=${a.options[0].id}`);
  expect((await order(request, p.slug, b.options[0].id)).status()).toBe(409);
  const hide = await page.request.post('/admin?/visibility', {
    form: { id, publication: 'hidden' },
    headers,
    maxRedirects: 0
  });
  expect(hide.status()).toBe(200);
  expect((await request.get(`/produtos/${a.slug}`, { maxRedirects: 0 })).status()).toBe(404);
  for (const image of p.images)
    expect((await request.get(`/media/${image.id}`)).status()).toBe(404);
  await page.request.post('/admin?/visibility', {
    form: { id, publication: 'published' },
    headers,
    maxRedirects: 0
  });
  expect((await request.get(`/produtos/${a.slug}`, { maxRedirects: 0 })).status()).toBe(308);
  await page.goto(`/admin/produtos/${id}`);
  await page.getByLabel('Remover foto 2', { exact: true }).click();
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.locator('p.success')).toBeVisible();
  p = await product(id);
  expect(p.options).toHaveLength(1);
  expect(p.images).toHaveLength(3);
  expect((await request.get(`/produtos/${b.slug}`, { maxRedirects: 0 })).status()).toBe(404);
  for (const image of b.images)
    expect((await request.get(`/media/${image.id}`)).status()).toBe(404);
  for (const image of a.images)
    expect((await request.get(`/media/${image.id}`)).status()).toBe(200);
  await page.reload();
  await page.getByRole('radio', { name: 'Um preço para o produto', exact: true }).check();
  await expect(page.locator('.upload-photo')).toHaveCount(3);
  await expect(page.getByLabel('Descrição', { exact: true })).toHaveValue(a.description);
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await expect(page.locator('p.success')).toBeVisible();
  p = await product(id);
  expect(p.mode).toBe('standard');
  expect(p.description).toBe(a.description);
  expect(p.images).toHaveLength(3);
  expect(p.options[0].sku).toBe(a.options[0].sku);
});

test('separação planejada preserva dados e links e os produtos podem ser reagrupados pela UI', async ({
  page,
  request
}, info) => {
  test.setTimeout(90_000);
  const source = await create(
    page,
    `Separar e juntar ${info.project.name}`,
    { mode: 'photo_variants', description: 'Texto do grupo não descreve todas as fotos.' },
    3
  );
  const folder = await mkdtemp(path.join(os.tmpdir(), 'flora-split-'));
  const args = [
    '--import',
    'tsx',
    'scripts/split-product.ts',
    '--product',
    source.id,
    '--expect-count',
    '3'
  ];
  try {
    let plan = JSON.parse((await execute(process.execPath, args)).stdout);
    expect(plan.count).toBe(3);
    expect((await product(source.id)).options).toHaveLength(3);
    await expect(
      execute(process.execPath, [
        ...args,
        '--apply',
        '--expect-fingerprint',
        'wrong',
        '--snapshot',
        path.join(folder, 'invalid.json')
      ])
    ).rejects.toBeTruthy();
    await expect(execute(process.execPath, [...args.slice(0, -1), '4'])).rejects.toBeTruthy();
    await pool.query("UPDATE products SET updated_at=updated_at+interval '1 second' WHERE id=$1", [
      source.id
    ]);
    await expect(
      execute(process.execPath, [
        ...args,
        '--apply',
        '--expect-fingerprint',
        plan.fingerprint,
        '--snapshot',
        path.join(folder, 'stale.json')
      ])
    ).rejects.toBeTruthy();
    expect((await product(source.id)).options).toHaveLength(3);
    plan = JSON.parse((await execute(process.execPath, args)).stdout);
    const snapshot = path.join(folder, 'before.json');
    const applied = JSON.parse(
      (
        await execute(process.execPath, [
          ...args,
          '--apply',
          '--expect-fingerprint',
          plan.fingerprint,
          '--snapshot',
          snapshot
        ])
      ).stdout
    );
    applied.products.forEach((p: any) => created.add(p.id));
    expect((await stat(snapshot)).mode & 0o777).toBe(0o600);
    expect(applied.createdCount).toBe(3);
    expect((await pool.query('SELECT * FROM products WHERE id=$1', [source.id])).rowCount).toBe(0);
    const children = await Promise.all(applied.products.map((p: any) => product(p.id)));
    for (let i = 0; i < children.length; i++) {
      const p = children[i];
      expect(p.name).toBe(`Opção ${i + 1}`);
      expect(p.description).toBe('');
      expect(p.mode).toBe('standard');
      expect(p.options[0].id).toBe(source.options[i].id);
      expect(p.options[0].sku).toBe(source.options[i].sku);
      expect(p.options[0].price_cents).toBe(source.options[i].price_cents);
      expect(p.options[0].show_price).toBe(source.options[i].show_price);
      expect(p.images[0].id).toBe(source.images[i].id);
      expect(p.images[0].storage_key).toBe(source.images[i].storage_key);
      expect((await request.get(`/media/${p.images[0].id}`)).status()).toBe(200);
      const link = await request.get(`/produtos/${source.slug}?opcao=${p.options[0].id}`, {
        maxRedirects: 0
      });
      expect(link.status()).toBe(308);
      expect(link.headers().location).toBe(`/produtos/${p.slug}`);
    }
    expect(
      (await request.get(`/produtos/${source.slug}`, { maxRedirects: 0 })).headers().location
    ).toBe('/catalogo');
    const grouped = await mergeUI(
      page,
      children.slice(0, 2).map((p) => p.id),
      `Orquídeas após separar ${info.project.name}`
    );
    expect(grouped.options).toHaveLength(2);
    const original = await request.get(
      `/produtos/${source.slug}?opcao=${children[0].options[0].id}`,
      { maxRedirects: 0 }
    );
    expect(original.headers().location).toBe(
      `/produtos/${grouped.slug}?opcao=${children[0].options[0].id}`
    );
    await page.setViewportSize({ width: 320, height: 844 });
    await page.addStyleTag({ content: 'html{font-size:200% !important}' });
    await readable(page);
    await page.screenshot({
      path: info.outputPath('grupo-texto-ampliado.png'),
      fullPage: true,
      scale: 'css'
    });
  } finally {
    await rm(folder, { recursive: true, force: true });
  }
});

test('agrupamento concorrente com exclusão mantém os arquivos das opções movidas', async ({
  page,
  request
}, info) => {
  const a = await create(page, `Concorrente A ${info.project.name}`);
  const b = await create(page, `Concorrente B ${info.project.name}`);
  const [first, second] = [a, b].sort((x, y) => x.id.localeCompare(y.id));
  const blocker = await pool.connect();
  const monitor = await pool.connect();
  let merging: ReturnType<typeof group> | undefined;
  let deleting: ReturnType<typeof page.request.post> | undefined;
  try {
    await blocker.query('BEGIN');
    await blocker.query('SELECT id FROM products WHERE id=$1 FOR UPDATE', [second.id]);
    merging = group(
      page.request,
      [first.id, second.id],
      `Concorrente agrupado ${info.project.name}`
    );
    // The grouping transaction must hold the first parent while waiting on our second parent lock.
    await expect
      .poll(async () =>
        Number(
          (
            await monitor.query(
              "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%products%' AND query LIKE '%for update%' "
            )
          ).rows[0].count
        )
      )
      .toBeGreaterThan(0);
    deleting = page.request.post('/admin?/delete', {
      form: { id: first.id, confirmation: first.name },
      headers,
      maxRedirects: 0
    });
    await expect
      .poll(async () =>
        Number(
          (
            await monitor.query(
              "SELECT count(*) FROM pg_stat_activity WHERE datname=current_database() AND wait_event_type='Lock' AND query LIKE '%products%' "
            )
          ).rows[0].count
        )
      )
      .toBeGreaterThanOrEqual(2);
    await blocker.query('COMMIT');
    expect((await merging).status()).toBe(303);
    expect((await deleting).status()).toBe(404);
    const id = (await merging).headers().location!.split('/').pop()!.split('?')[0]!;
    expect((await product(id)).images).toHaveLength(2);
    for (const image of [...a.images, ...b.images])
      expect((await request.get(`/media/${image.id}`)).status()).toBe(200);
  } finally {
    await blocker.query('ROLLBACK');
    blocker.release();
    monitor.release();
    await merging;
    await deleting;
  }
});
