import { test, expect, type Page } from '@playwright/test';
import { Pool } from 'pg';
import path from 'node:path';
const authDir = process.env.TEST_AUTH_DIR ?? 'playwright/.auth';
const adminState = path.join(authDir, 'admin.json');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
const pageErrors = new WeakMap<Page, string[]>();
test.beforeAll(() => {
  if (process.env.APP_ENV !== 'e2e' || !process.env.DATABASE_URL?.endsWith('/flora_e2e'))
    throw new Error('E2E requires the isolated flora_e2e database.');
});
test.afterAll(async () => pool.end());
test.beforeEach(async ({ page, context }) => {
  // Context routing also catches the first request of newly opened tabs.
  await context.route(
    (url) =>
      url.hostname === 'wa.me' ||
      url.hostname === 'whatsapp.com' ||
      url.hostname.endsWith('.whatsapp.com'),
    async (route) => {
      await route.fulfill({
        status: 200,
        contentType: 'text/html',
        body: '<html><body>Conversa simulada</body></html>'
      });
    }
  );
  const errors: string[] = [];
  pageErrors.set(page, errors);
  page.on('pageerror', (error) => errors.push(error.message));
  await page.clock.setFixedTime(new Date('2026-11-04T15:00:00Z'));
  // Reset mutable shop preferences between tests and browser projects, keeping product history isolated by name.
  await pool.query(
    "UPDATE site_settings SET card_enabled=false, card_price_cents=null, about_image_id=null, about_title='De Sabará, com carinho.', about_text='Uma história de flores e carinho.', weekly_hours=$1 WHERE id='main'",
    [
      JSON.stringify({
        mon: { open: '09:00', close: '18:00' },
        tue: { open: '09:00', close: '18:00' },
        wed: { open: '09:00', close: '18:00' },
        thu: { open: '09:00', close: '18:00' },
        fri: { open: '09:00', close: '18:00' },
        sat: { open: '09:00', close: '14:00' },
        sun: null
      })
    ]
  );
});
test.afterEach(async ({ page }) => {
  expect(pageErrors.get(page) ?? [], 'Nenhum erro JavaScript inesperado').toEqual([]);
});
async function login(page: Page) {
  const state = await import('node:fs/promises').then((fs) => fs.readFile(adminState, 'utf8'));
  await page.context().addCookies(JSON.parse(state).cookies);
}
async function saveProduct(page: Page) {
  const response = page.waitForResponse(
    (r) =>
      r.request().method() === 'POST' && new URL(r.url()).pathname.startsWith('/admin/produtos/')
  );
  await page.getByRole('button', { name: 'Salvar produto', exact: true }).click();
  await response;
  await expect(page.getByRole('button', { name: 'Salvar produto', exact: true })).toBeEnabled();
}
async function selectPhotos(
  page: Page,
  files: Parameters<ReturnType<Page['getByLabel']>['setInputFiles']>[0]
) {
  const input = page.getByLabel('Escolher fotos', { exact: true });
  await expect(input).toBeEnabled();
  await input.setInputFiles(files);
}
async function openOrder(page: Page, slug = 'rosas') {
  await page.goto(`/produtos/${slug}`);
  await page.getByRole('button', { name: 'Pedir via WhatsApp' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
}
const testAddress = {
  postalCode: '34590290',
  street: 'Rua das Flores',
  number: '123-A',
  complement: 'Apto 201 · Bloco B',
  district: 'Centro',
  city: 'Sabará',
  state: 'MG',
  reference: 'Próximo à praça'
};
async function fillAddress(page: Page) {
  for (const [label, field] of [
    ['CEP', 'postalCode'],
    ['Rua ou avenida', 'street'],
    ['Número', 'number'],
    ['Complemento', 'complement'],
    ['Bairro', 'district'],
    ['Cidade', 'city'],
    ['Ponto de referência', 'reference']
  ] as const)
    await page.getByLabel(label, { exact: false }).fill(testAddress[field]);
  await page.getByLabel('Estado (UF)', { exact: true }).selectOption(testAddress.state);
}
async function collectWhatsApp(page: Page) {
  const originalURL = page.url();
  const newPage = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Continuar no WhatsApp' }).click();
  const conversation = await newPage;
  await conversation.waitForURL((url) => url.origin === 'https://wa.me', { waitUntil: 'load' });
  const result = new URL(conversation.url());
  expect(result.pathname).toBe('/5531999990000');
  expect(page.url()).toBe(originalURL);
  expect(await conversation.evaluate(() => window.opener === null)).toBe(true);
  await conversation.close();
  await expect(page.getByRole('dialog')).toBeVisible();
  return result.searchParams.get('text') ?? '';
}
test('links de WhatsApp do cabeçalho, rodapé e história preservam a aba do site', async ({
  page
}) => {
  await pool.query('UPDATE site_settings SET about_text=$1 WHERE id=$2', [
    '[Converse sobre flores](https://wa.me/5531999990000)\n\n[Contato pelo WhatsApp](https://api.whatsapp.com/send?phone=5531999990000)\n\n[Explorar catálogo](/catalogo)',
    'main'
  ]);
  await page.goto('/');
  const originalURL = page.url();
  await expect(
    page.getByRole('link', { name: 'Explorar catálogo', exact: true })
  ).not.toHaveAttribute('target', '_blank');
  for (const name of [
    'Vamos conversar',
    'Falar pelo WhatsApp',
    'Converse sobre flores',
    'Contato pelo WhatsApp'
  ]) {
    const link = page.getByRole('link', { name, exact: true });
    await expect(link).toHaveAttribute('target', '_blank');
    await expect(link).toHaveAttribute('rel', /noopener/);
    const newPage = page.context().waitForEvent('page');
    await link.click();
    const conversation = await newPage;
    await conversation.waitForURL(
      (url) => url.hostname === 'wa.me' || url.hostname === 'api.whatsapp.com',
      { waitUntil: 'load' }
    );
    expect(page.url()).toBe(originalURL);
    expect(await conversation.evaluate(() => window.opener === null)).toBe(true);
    await conversation.close();
  }
});
test('catálogo, busca sem acentos, categorias e navegação responsiva', async ({ page }, info) => {
  await page.goto('/');
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Carinho que floresce');
  await expect(page.locator('.category-item > svg')).toHaveCount(0);
  await expect(page.locator('#sobre a')).toHaveCount(0);
  await page.getByRole('link', { name: 'Conheça nosso catálogo' }).click();
  await expect(page.getByTestId('product-card')).toHaveCount(6);
  const layout = await page.locator('.search-form').evaluate((form) => {
    const input = form.querySelector('input')!;
    const icon = form.querySelector('.search-field svg')!;
    const select = form.querySelector('select')!;
    const button = form.querySelector('button')!;
    const inputBox = input.getBoundingClientRect();
    const iconBox = icon.getBoundingClientRect();
    return {
      input: { y: inputBox.y, height: inputBox.height },
      select: {
        y: select.getBoundingClientRect().y,
        height: select.getBoundingClientRect().height
      },
      button: {
        y: button.getBoundingClientRect().y,
        height: button.getBoundingClientRect().height
      },
      iconCenterOffset: Math.abs(iconBox.y + iconBox.height / 2 - inputBox.y - inputBox.height / 2),
      textClearance: inputBox.x + parseFloat(getComputedStyle(input).paddingLeft) - iconBox.right,
      width: innerWidth
    };
  });
  expect(layout.iconCenterOffset).toBeLessThan(1);
  expect(layout.textClearance).toBeGreaterThanOrEqual(8);
  for (const field of [layout.input, layout.select, layout.button]) expect(field.height).toBe(49);
  expect(Math.abs(layout.select.y - layout.button.y)).toBeLessThan(1);
  if (layout.width > 700) expect(Math.abs(layout.input.y - layout.button.y)).toBeLessThan(1);
  await page.getByRole('textbox', { name: 'Buscar produtos' }).fill('girassois');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await expect(page.getByRole('heading', { name: 'Alegria em Girassóis' })).toBeVisible();
  await page.getByRole('textbox', { name: 'Buscar produtos' }).fill('');
  await page.getByRole('combobox', { name: 'Filtrar por categoria' }).selectOption('cestas');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await page.getByRole('textbox', { name: 'Buscar produtos' }).fill('nenhuma-flor-assim');
  await page.getByRole('button', { name: 'Buscar' }).click();
  await expect(page.getByRole('heading', { name: 'Nenhum produto por aqui.' })).toBeVisible();
  await page.goto('/');
  expect(
    await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth + 1)
  ).toBe(true);
  await page.screenshot({ path: info.outputPath('inicio.png'), fullPage: true });
});
async function expectReadableMobile(page: Page) {
  const metrics = await page.evaluate(() => {
    const smallText: { text: string; size: number }[] = [];
    const walker = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
    while (walker.nextNode()) {
      const text = walker.currentNode.textContent?.trim();
      const element = walker.currentNode.parentElement;
      if (
        !text ||
        !element ||
        element.closest('script, style, noscript, .sr-only, [aria-hidden="true"]')
      )
        continue;
      const range = document.createRange();
      range.selectNodeContents(walker.currentNode);
      const box = range.getBoundingClientRect();
      if (box.width <= 1 || box.height <= 1) continue;
      const size = parseFloat(getComputedStyle(element).fontSize);
      if (size < 14) smallText.push({ text: text.slice(0, 80), size });
    }
    const smallFields = Array.from(document.querySelectorAll('input, select, textarea'))
      .filter(
        (element) =>
          element.getClientRects().length &&
          !element.matches('[type="hidden"], [type="checkbox"], [type="radio"], [type="file"]')
      )
      .filter((element) => parseFloat(getComputedStyle(element).fontSize) < 16)
      .map((element) => element.id);
    return {
      smallText,
      smallFields,
      overflow: document.documentElement.scrollWidth - innerWidth
    };
  });
  expect(metrics.smallText, 'Textos visíveis com pelo menos 14 px').toEqual([]);
  expect(metrics.smallFields, 'Campos legíveis sem precisar ampliar').toEqual([]);
  expect(metrics.overflow, 'Sem rolagem horizontal da página').toBeLessThanOrEqual(1);
}

test('tipografia mobile mantém textos, campos e acesso administrativo legíveis', async ({
  page
}, info) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expectReadableMobile(page);
  const admin = page.locator('.footer-bottom a');
  expect(
    await admin.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
  ).toBeGreaterThanOrEqual(18);
  expect((await admin.boundingBox())!.height).toBeGreaterThanOrEqual(44);
  await page.locator('.footer-bottom').screenshot({ path: info.outputPath('rodape-mobile.png') });
  await page.goto('/catalogo');
  await expectReadableMobile(page);
  expect(
    await page
      .locator('.product-price')
      .first()
      .evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
  ).toBeGreaterThanOrEqual(18);
  await openOrder(page);
  await page.getByLabel('Entrega', { exact: true }).check();
  await expectReadableMobile(page);
  await page.getByRole('dialog').screenshot({ path: info.outputPath('pedido-mobile.png') });
  await page.goto('/entrar');
  await expectReadableMobile(page);
  await login(page);
  for (const route of [
    '/admin',
    '/admin/produtos/novo',
    '/admin/configuracoes',
    '/admin/categorias'
  ]) {
    await page.goto(route);
    await expectReadableMobile(page);
    for (const link of await page.locator('.admin-nav a').all()) {
      expect(
        await link.evaluate((element) => parseFloat(getComputedStyle(element).fontSize))
      ).toBeGreaterThanOrEqual(16);
      expect((await link.boundingBox())!.height).toBeGreaterThanOrEqual(44);
    }
  }
  await page.screenshot({ path: info.outputPath('admin-mobile.png') });
  if (info.project.use.hasTouch) {
    await page.setViewportSize({ width: 844, height: 390 });
    for (const route of ['/catalogo', '/admin/configuracoes']) {
      await page.goto(route);
      await expectReadableMobile(page);
    }
  }
});

test('ampliação de texto em 200% funciona em tela de 320 px sem perder campos', async ({
  page
}) => {
  test.setTimeout(90_000);
  await page.setViewportSize({ width: 320, height: 900 });
  await login(page);
  for (const route of [
    '/',
    '/catalogo',
    '/produtos/rosas',
    '/admin',
    '/admin/produtos/novo',
    '/admin/configuracoes'
  ]) {
    await page.goto(route);
    await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
    await expectReadableMobile(page);
    if (route === '/produtos/rosas') {
      await page.getByRole('button', { name: 'Pedir via WhatsApp' }).click();
      await page.getByLabel('Entrega', { exact: true }).check();
      await expectReadableMobile(page);
      await expect(page.getByLabel('Estado (UF)', { exact: true })).toBeVisible();
      await expect(
        page.getByRole('button', { name: 'Continuar no WhatsApp', exact: true })
      ).toBeVisible();
    }
  }
});

test('indisponível é somente visualização; sob consulta permite solicitar', async ({
  page,
  request
}) => {
  const response = await page.goto('/produtos/cesta');
  expect(response?.status()).toBe(200);
  await expect(
    page.getByText('Este produto está indisponível no momento.', { exact: true })
  ).toBeVisible();
  await expect(
    page.getByRole('button', { name: /Pedir via WhatsApp|Consultar disponibilidade/ })
  ).toHaveCount(0);
  const denied = await request.post('/produtos/cesta?/solicitar', {
    form: { date: '', period: 'combinar', delivery: 'pickup' },
    headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
    maxRedirects: 0
  });
  expect(denied.status()).toBe(409);
  expect(denied.headers().location).toBeUndefined();
  await page.goto('/produtos/jardim');
  await page.getByRole('button', { name: 'Consultar disponibilidade' }).click();
  await expect(page.getByRole('dialog')).toBeVisible();
  expect(await collectWhatsApp(page)).toContain('Jardim de Cores');
});
test('preço privado não aparece em HTML, navegação ou mensagem', async ({ page, request }) => {
  const response = await request.get('/produtos/tulipas');
  const html = await response.text();
  expect(html).not.toContain('73891');
  expect(html).not.toMatch(/738[,.]91/);
  await openOrder(page, 'tulipas');
  await expect(page.getByRole('dialog')).toContainText('Preço sob consulta');
  const text = await collectWhatsApp(page);
  expect(text).toContain('consultar o preço');
  expect(text).not.toContain('738');
  expect(text).not.toContain('Preço anunciado');
});
test('busca por referência ignora caixa e respeita categorias e visibilidade', async ({
  page,
  request
}) => {
  await page.goto('/catalogo');
  await page.getByRole('textbox', { name: 'Buscar produtos' }).fill(' fc-001 ');
  await page.getByRole('button', { name: 'Buscar', exact: true }).click();
  await expect(page.getByTestId('product-card')).toHaveCount(1);
  await page.getByRole('link', { name: 'Buquê de Rosas', exact: true }).click();
  await expect(page.locator('.sku')).toHaveText('Referência: FC-001');
  await page.goto('/catalogo?q=FC-001&categoria=cestas');
  await expect(page.getByTestId('product-card')).toHaveCount(0);
  for (const sku of ['FC-007', 'FC-008', 'FC-999']) {
    await page.goto(`/catalogo?q=${sku}`);
    await expect(page.getByTestId('product-card')).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Nenhum produto por aqui.' })).toBeVisible();
  }
  expect((await request.get('/produtos/oculto')).status()).toBe(404);
});
test('oculto, rascunho e inexistente retornam 404 real com retorno ao início', async ({
  page,
  request
}) => {
  for (const slug of ['oculto', 'rascunho', 'nao-existe']) {
    const response = await request.get(`/produtos/${slug}`);
    expect(response.status()).toBe(404);
  }
  const response = await page.goto('/produtos/oculto');
  expect(response?.status()).toBe(404);
  await page.getByRole('link', { name: 'Voltar para a página inicial' }).click();
  await expect(page.getByRole('heading', { level: 1 })).toContainText('Carinho que floresce');
});
test('pedido de retirada com data a combinar e sem cartão', async ({ page }, info) => {
  await openOrder(page);
  await expect(page.getByRole('group', { name: 'Endereço de entrega', exact: true })).toHaveCount(
    0
  );
  await expect(page.getByLabel('Adicionar cartão', { exact: false })).toHaveCount(0);
  await page
    .getByLabel('Quer contar mais alguma coisa?', { exact: false })
    .fill('Para comemorar ❤️ & flores');
  await page.getByRole('dialog').screenshot({ path: info.outputPath('pedido-retirada.png') });
  const text = await collectWhatsApp(page);
  expect(text).toContain('Buquê de Rosas');
  expect(text).toContain('149,90');
  expect(text).toContain('Data desejada: Ainda não sei');
  expect(text).toContain('Retirada na floricultura');
  expect(text).toContain('Para comemorar ❤️ & flores');
  expect(text).not.toContain('Adicionar cartão');
  expect(text).not.toContain('CEP:');
});
test('entrega, data, horário, cartão e subtotal vêm dos valores atuais do servidor', async ({
  page
}, info) => {
  await pool.query('UPDATE site_settings SET card_enabled=true,card_price_cents=500');
  await openOrder(page);
  await page.getByLabel('Ainda não sei a data').uncheck();
  await page.getByLabel('Data desejada', { exact: true }).fill('2026-11-06');
  await page.getByLabel('Período ou horário').selectOption('horario');
  await page.getByLabel('Horário desejado').fill('14:30');
  await page.getByLabel('Entrega', { exact: true }).check();
  await fillAddress(page);
  const spacing = await page.locator('#delivery-address').evaluate((address) => {
    const options = document.querySelector('.delivery-options')!.getBoundingClientRect();
    const firstField = address.querySelector('label')!.getBoundingClientRect();
    const label = address.querySelector('label[for="district"]')!.getBoundingClientRect();
    const input = address.querySelector('#district')!.getBoundingClientRect();
    return { fromOptions: firstField.top - options.bottom, fromLabel: input.top - label.bottom };
  });
  expect(spacing.fromOptions).toBeGreaterThanOrEqual(8);
  expect(spacing.fromOptions).toBeLessThanOrEqual(16);
  expect(spacing.fromLabel).toBeGreaterThanOrEqual(4);
  expect(spacing.fromLabel).toBeLessThanOrEqual(8);
  expect(
    await page.getByRole('dialog').evaluate((el) => el.scrollWidth <= el.clientWidth + 1)
  ).toBe(true);
  await page
    .getByRole('group', { name: 'Como você prefere receber?', exact: true })
    .screenshot({ path: info.outputPath('endereco-entrega.png') });
  await page.getByLabel('Adicionar cartão', { exact: false }).check();
  await page.getByLabel('Mensagem do cartão', { exact: true }).fill('Com amor, para você!');
  await expect(page.getByText('Subtotal estimado')).toContainText('154,90');
  const text = await collectWhatsApp(page);
  expect(text).toContain('06/11/2026');
  expect(text).toContain('14:30');
  expect(text).toContain('Centro, Sabará');
  expect(text).toContain('Rua das Flores, 123-A');
  expect(text).toContain('Complemento: Apto 201 · Bloco B');
  expect(text).toContain('Sabará/MG');
  expect(text).toContain('CEP: 34590-290');
  expect(text).toContain('Ponto de referência: Próximo à praça');
  expect(text).toContain('Taxa a combinar');
  expect(text).toContain('Com amor, para você!');
  expect(text).toContain('154,90');
});
test('endereço preserva dados ao alternar modalidade e após erro do servidor', async ({ page }) => {
  await openOrder(page);
  await page.getByLabel('Entrega', { exact: true }).check();
  await fillAddress(page);
  await page.getByLabel('Retirada na loja', { exact: true }).check();
  await expect(page.getByRole('group', { name: 'Endereço de entrega', exact: true })).toHaveCount(
    0
  );
  await page.getByLabel('Entrega', { exact: true }).check();
  await expect(page.getByLabel('Rua ou avenida', { exact: true })).toHaveValue(testAddress.street);
  await page.getByLabel('CEP', { exact: true }).fill('123');
  await page.getByRole('button', { name: 'Continuar no WhatsApp' }).click();
  expect(
    await page
      .getByLabel('CEP', { exact: true })
      .evaluate((el: HTMLInputElement) => el.validity.patternMismatch)
  ).toBe(true);
  await page.getByLabel('CEP', { exact: true }).fill(testAddress.postalCode);
  const action = '**/produtos/rosas?*/solicitar';
  await page.route(action, async (route) => {
    const form = new URLSearchParams(route.request().postData()!);
    form.set('state', 'XX');
    await route.continue({ postData: form.toString() });
  });
  const rejectedPage = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Continuar no WhatsApp' }).click();
  const rejectedConversation = await rejectedPage;
  await expect(page.getByRole('alert')).toContainText('Selecione um estado válido.');
  await expect(page.locator('[data-sonner-toast][data-type=error]')).toContainText(
    'Selecione um estado válido.'
  );
  await expect.poll(() => rejectedConversation.isClosed()).toBe(true);
  expect(page.context().pages()).toHaveLength(1);
  await expect(page.getByLabel('Rua ou avenida', { exact: true })).toHaveValue(testAddress.street);
  await expect(page.getByLabel('Número', { exact: true })).toHaveValue(testAddress.number);
  await expect(page.getByLabel('Complemento', { exact: false })).toHaveValue(
    testAddress.complement
  );
  await page.unroute(action);
  await page.getByLabel('Complemento', { exact: false }).fill('');
  await page.getByLabel('Ponto de referência', { exact: false }).fill('');
  const text = await collectWhatsApp(page);
  expect(text).toContain('CEP: 34590-290');
  expect(text).not.toContain('Complemento:');
  expect(text).not.toContain('Ponto de referência:');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('bloqueio de nova aba oferece link manual sem sair do produto', async ({ page }) => {
  await openOrder(page);
  const originalURL = page.url();
  await page.evaluate(() => {
    window.open = () => null;
  });
  await page.getByRole('button', { name: 'Continuar no WhatsApp' }).click();
  const link = page.getByRole('link', { name: 'Continuar no WhatsApp', exact: true });
  await expect(link).toBeVisible();
  expect(page.url()).toBe(originalURL);
  expect(page.context().pages()).toHaveLength(1);
  await page
    .getByLabel('Quer contar mais alguma coisa?', { exact: false })
    .fill('Uma surpresa especial');
  await expect(link).toHaveCount(0);
  await page.getByRole('button', { name: 'Continuar no WhatsApp' }).click();
  await expect(link).toBeVisible();
  const newPage = page.context().waitForEvent('page');
  await link.click();
  const conversation = await newPage;
  await conversation.waitForURL('https://wa.me/**', { waitUntil: 'load' });
  expect(new URL(conversation.url()).searchParams.get('text')).toContain('Uma surpresa especial');
  expect(await conversation.evaluate(() => window.opener === null)).toBe(true);
  expect(page.url()).toBe(originalURL);
  await conversation.close();
});
test('falha ao preparar conversa fecha a aba temporária e permite tentar novamente', async ({
  page
}) => {
  await openOrder(page);
  const originalURL = page.url();
  await page.getByLabel('Quer contar mais alguma coisa?', { exact: false }).fill('Com carinho');
  const action = '**/produtos/rosas?*/solicitar';
  await page.route(action, (route) => route.abort('failed'));
  const newPage = page.context().waitForEvent('page');
  await page.getByRole('button', { name: 'Continuar no WhatsApp' }).click();
  const conversation = await newPage;
  await expect(page.getByRole('alert')).toContainText('Não foi possível preparar a conversa.');
  await expect(page.locator('[data-sonner-toast][data-type=error]')).toContainText(
    'Não foi possível preparar a conversa.'
  );
  await expect.poll(() => conversation.isClosed()).toBe(true);
  expect(page.url()).toBe(originalURL);
  await expect(page.getByLabel('Quer contar mais alguma coisa?', { exact: false })).toHaveValue(
    'Com carinho'
  );
  await page.unroute(action);
  expect(await collectWhatsApp(page)).toContain('Com carinho');
  await expect(page.getByRole('alert')).toHaveCount(0);
});
test('fora do horário avisa e continua permitindo enviar', async ({ page }) => {
  await pool.query('UPDATE site_settings SET weekly_hours=$1', [
    JSON.stringify({ mon: null, tue: null, wed: null, thu: null, fri: null, sat: null, sun: null })
  ]);
  await openOrder(page);
  await expect(
    page.getByText('Estamos fora do horário de atendimento.', { exact: true })
  ).toBeVisible();
  expect(await collectWhatsApp(page)).toContain('Buquê de Rosas');
});
test('servidor rejeita data passada e entrega sem local', async ({ request }) => {
  const base = {
    date: '',
    period: 'combinar',
    time: '',
    delivery: 'pickup',
    district: '',
    city: '',
    note: '',
    cardMessage: ''
  };
  for (const overrides of [
    { date: '2000-01-01' },
    { date: '2026-11-31' },
    { delivery: 'delivery' }
  ]) {
    const response = await request.post('/produtos/rosas?/solicitar', {
      form: { ...base, ...overrides },
      headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
      maxRedirects: 0
    });
    expect(response.status()).toBe(400);
  }
  for (const field of ['postalCode', 'street', 'number', 'district', 'city', 'state'] as const) {
    const response = await request.post('/produtos/rosas?/solicitar', {
      form: { ...base, ...testAddress, delivery: 'delivery', [field]: ' ' },
      headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
      maxRedirects: 0
    });
    expect(response.status(), `${field} é obrigatório`).toBe(400);
  }
  for (const overrides of [
    { postalCode: 'abcde-fgh' },
    { postalCode: '12345' },
    { state: 'XX' },
    { street: 'x'.repeat(181) }
  ]) {
    const response = await request.post('/produtos/rosas?/solicitar', {
      form: { ...base, ...testAddress, delivery: 'delivery', ...overrides },
      headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
      maxRedirects: 0
    });
    expect(response.status()).toBe(400);
  }
  const noNumber = await request.post('/produtos/rosas?/solicitar', {
    form: {
      ...base,
      ...testAddress,
      delivery: 'delivery',
      number: 's/n',
      state: 'mg',
      postalCode: '34590-290'
    },
    headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
    maxRedirects: 0
  });
  expect(noNumber.status()).toBe(303);
  expect(new URL(noNumber.headers().location!).searchParams.get('text')).toContain(
    'Rua das Flores, s/n'
  );
});
test('preços adulterados no formulário são ignorados no redirecionamento', async ({ request }) => {
  await pool.query('UPDATE site_settings SET card_enabled=true,card_price_cents=500');
  const response = await request.post('/produtos/rosas?/solicitar', {
    form: {
      date: '',
      period: 'combinar',
      delivery: 'pickup',
      card: 'on',
      cardMessage: 'Com amor',
      priceCents: '1',
      cardPriceCents: '1'
    },
    headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
    maxRedirects: 0
  });
  expect(response.status()).toBe(303);
  const text = new URL(response.headers().location!).searchParams.get('text');
  expect(text).toContain('149,90');
  expect(text).toContain('154,90');
});
test('admin exige sessão autorizada em páginas, ações e upload', async ({
  page,
  request,
  browser
}) => {
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/entrar/);
  await expect(page.getByRole('button', { name: 'Entrar com Google' })).toBeDisabled();
  const upload = await request.post('/admin/upload', {
    multipart: {
      file: { name: 'fake.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('invalid') }
    },
    headers: { origin: process.env.BASE_URL! }
  });
  expect(upload.status()).toBe(401);
  const post = await request.post('/admin?/visibility', {
    form: { id: 'demo-rosas', publication: 'hidden' },
    headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
    maxRedirects: 0
  });
  expect(post.status()).toBe(303);
  expect(post.headers().location).toBe('/entrar');
  const other = await browser.newContext({ storageState: path.join(authDir, 'outsider.json') });
  const rejected = await other.newPage();
  const response = await rejected.goto('/admin');
  expect(response?.status()).toBe(403);
  await other.close();
});
test('produto com fotos: retry, preservar erro, reordenar, publicar, esconder e excluir', async ({
  page,
  request
}, info) => {
  await login(page);
  await page.goto('/admin/produtos/novo');
  const name = `Teste ${info.project.name} com carinho`;
  await page.getByLabel('Nome do produto', { exact: true }).fill(name);
  await page.getByLabel('Descrição', { exact: true }).fill('Fotos e detalhes pelo celular.');
  await page.getByLabel('Preço (R$)', { exact: true }).fill('-10');
  await page.getByLabel('Visibilidade', { exact: true }).selectOption('published');
  await page.getByLabel('Buquês', { exact: true }).check();
  await page.route(
    '**/admin/upload',
    (route) =>
      route.fulfill({
        status: 400,
        contentType: 'application/json',
        body: JSON.stringify({ error: 'Falha simulada no envio.' })
      }),
    { times: 1 }
  );
  await selectPhotos(page, 'static/demo/rosas-vermelhas.jpg');
  await expect(page.getByRole('alert')).toContainText('Falha simulada');
  await expect(page.getByRole('button', { name: 'Salvar produto' })).toBeDisabled();
  await page.getByRole('button', { name: 'Tentar novamente' }).click();
  await expect(page.getByRole('button', { name: 'Salvar produto' })).toBeEnabled();
  await selectPhotos(page, 'static/demo/girassois.jpg');
  await expect(page.getByRole('button', { name: 'Salvar produto' })).toBeEnabled();
  await expect(page.locator('.upload-photo')).toHaveCount(2);
  await page.getByRole('button', { name: 'Mover foto 2 para antes' }).click();
  const cover = await page.locator('input[name=mediaIds]').inputValue();
  await saveProduct(page);
  await expect(page.getByRole('alert')).toContainText('preço válido');
  await expect(page.getByLabel('Nome do produto', { exact: true })).toHaveValue(name);
  await expect(page.locator('.upload-photo')).toHaveCount(2);
  await page.getByLabel('Preço (R$)', { exact: true }).fill('89,90');
  await saveProduct(page);
  await expect(page.getByRole('status')).toContainText('criado');
  await expect(page.locator('input[name=mediaIds]')).toHaveValue(cover);
  const id = page.url().split('/').pop()!.split('?')[0]!;
  const [row] = (await pool.query('SELECT slug FROM products WHERE id=$1', [id])).rows;
  const slug = row.slug;
  const publicPage = await page.context().browser()!.newContext();
  const customer = await publicPage.newPage();
  await customer.goto(`/produtos/${slug}`);
  await expect(customer.getByRole('heading', { name })).toBeVisible();
  const mediaId = JSON.parse(cover)[0];
  expect((await publicPage.request.get(`/media/${mediaId}`)).status()).toBe(200);
  await page.getByLabel('Disponibilidade', { exact: true }).selectOption('unavailable');
  await saveProduct(page);
  await expect(page.getByRole('status')).toContainText('salvo');
  await customer.reload();
  await expect(
    customer.getByText('Este produto está indisponível no momento.', { exact: true })
  ).toBeVisible();
  await expect(
    customer.getByRole('button', { name: /Pedir via WhatsApp|Consultar disponibilidade/ })
  ).toHaveCount(0);
  await page.getByLabel('Visibilidade', { exact: true }).selectOption('hidden');
  await saveProduct(page);
  await expect(page.getByRole('status')).toContainText('salvo');
  expect((await publicPage.request.get(`/produtos/${slug}`)).status()).toBe(404);
  expect((await publicPage.request.get(`/media/${mediaId}`)).status()).toBe(404);
  await page.getByLabel('Visibilidade', { exact: true }).selectOption('published');
  await page.getByLabel('Exibir preço no catálogo', { exact: true }).uncheck();
  await saveProduct(page);
  await expect(page.getByRole('status')).toContainText('salvo');
  const html = await (await publicPage.request.get(`/produtos/${slug}`)).text();
  expect(html).not.toContain('8990');
  await page.getByRole('link', { name: 'Voltar aos produtos' }).click();
  const card = page
    .getByTestId('admin-product')
    .filter({ has: page.getByRole('heading', { name, exact: true }) });
  await card.getByRole('button', { name: `Excluir ${name}`, exact: true }).click();
  await card.getByLabel('Nome do produto para confirmar').fill('errado');
  await card.getByRole('button', { name: 'Excluir permanentemente' }).click();
  await expect(page.getByRole('alert')).toContainText('nome exato');
  await card.getByRole('button', { name: `Excluir ${name}`, exact: true }).click();
  await card.getByLabel('Nome do produto para confirmar').fill(name);
  await card.getByRole('button', { name: 'Excluir permanentemente' }).click();
  await expect(page.getByRole('status')).toContainText('excluído');
  expect((await publicPage.request.get(`/produtos/${slug}`)).status()).toBe(404);
  expect((await request.get(`/media/${mediaId}`)).status()).toBe(404);
  await publicPage.close();
});
test('categorias podem ser criadas, renomeadas e removidas', async ({ page }, info) => {
  await login(page);
  await page.goto('/admin/categorias');
  const name = `Orquídeas ${info.project.name}`;
  await page.getByLabel('Nome da nova categoria').fill(name);
  await page.getByRole('button', { name: 'Adicionar', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('salva');
  const panel = page.locator('.category-admin-list .form-panel').filter({
    has: page
      .getByRole('textbox', { name: 'Nome da categoria', exact: true })
      .filter({ visible: true })
  });
  const field = page.locator('.category-admin-list input[name=name]').filter({ hasNotText: 'x' });
  const count = await field.count();
  let match = field.nth(count - 1);
  for (let i = 0; i < count; i++)
    if ((await field.nth(i).inputValue()) === name) match = field.nth(i);
  const newName = `${name} especiais`;
  await match.fill(newName);
  const own = match.locator('..').locator('..');
  await own.getByRole('button', { name: `Salvar ${name}`, exact: true }).click();
  await expect(page.getByRole('status')).toContainText('salva');
  await page.getByRole('button', { name: `Remover ${newName}`, exact: true }).click();
  await page.getByLabel('Remover esta categoria.', { exact: false }).check();
  await page.getByRole('button', { name: 'Confirmar remoção', exact: true }).click();
  await expect(page.getByRole('status')).toContainText('removida');
});
test('história sanitizada, foto, horários e cartão podem ser editados pelo celular', async ({
  page
}, info) => {
  await login(page);
  await page.goto('/admin/configuracoes');
  await page
    .getByLabel('Título da história', { exact: true })
    .fill(`Nossa história ${info.project.name}`);
  await page
    .getByLabel('Biografia da loja', { exact: true })
    .fill('Uma história com **carinho**.\n\n<script>alert("xss")</script>');
  await page.getByLabel('Oferecer cartão no pedido', { exact: true }).check();
  await page.getByLabel('Preço do cartão (R$)', { exact: true }).fill('7,50');
  await selectPhotos(page, 'static/demo/cesta-floral.jpg');
  await expect(page.getByRole('button', { name: 'Salvar informações' })).toBeEnabled();
  await page.getByRole('button', { name: 'Salvar informações' }).click();
  await expect(page.getByRole('status')).toContainText('atualizadas');
  await page.goto('/');
  await expect(
    page.getByRole('heading', { name: `Nossa história ${info.project.name}` })
  ).toBeVisible();
  await expect(page.locator('.prose strong')).toHaveText('carinho');
  expect(await page.locator('.prose').innerHTML()).not.toContain('<script');
  await page.screenshot({ path: info.outputPath('historia.png'), fullPage: true });
  await openOrder(page);
  await expect(page.getByLabel('Adicionar cartão', { exact: false })).toBeVisible();
});

test('rascunho, múltiplas categorias, destaque, galeria e remoção de foto', async ({
  page
}, info) => {
  await login(page);
  await page.goto('/admin/produtos/novo');
  const name = `Rascunho ${info.project.name}`;
  await page.getByLabel('Nome do produto', { exact: true }).fill(name);
  await page.getByLabel('Preço (R$)', { exact: true }).fill('50,00');
  await page.getByLabel('Arranjos', { exact: true }).check();
  await page.getByLabel('Flores', { exact: true }).check();
  await page.getByLabel('Destacar na página inicial', { exact: true }).check();
  await selectPhotos(page, ['static/demo/tulipas-rosas.jpg', 'static/demo/rosas-rosas.jpg']);
  await expect(page.locator('.upload-photo')).toHaveCount(2);
  await expect(page.getByRole('button', { name: 'Salvar produto' })).toBeEnabled();
  await saveProduct(page);
  await expect(page.getByRole('status')).toContainText('criado');
  const id = page.url().split('/').pop()!.split('?')[0]!;
  const slug = (await pool.query('SELECT slug FROM products WHERE id=$1', [id])).rows[0].slug;
  expect((await page.request.get(`/produtos/${slug}`)).status()).toBe(404);
  await page.getByLabel('Visibilidade', { exact: true }).selectOption('published');
  await saveProduct(page);
  await expect(page.getByRole('status')).toContainText('salvo');
  for (const category of ['arranjos', 'flores']) {
    const response = await page.request.get(`/catalogo?categoria=${category}`);
    expect(await response.text()).toContain(name);
  }
  await page.goto('/');
  await expect(page.getByRole('heading', { name, exact: true })).toBeVisible();
  await page.goto(`/produtos/${slug}`);
  await expect(page.getByRole('button', { name: 'Ver foto 2' })).toBeVisible();
  const original = await page.locator('.gallery-main img').getAttribute('src');
  await page.getByRole('button', { name: 'Ver foto 2' }).click();
  await expect(page.locator('.gallery-main img')).not.toHaveAttribute('src', original!);
  await page.goto(`/admin/produtos/${id}`);
  await page.getByRole('button', { name: 'Remover foto 1', exact: true }).click();
  await page.getByLabel('Arranjos', { exact: true }).uncheck();
  await page.getByLabel('Visibilidade', { exact: true }).selectOption('draft');
  await saveProduct(page);
  await expect(page.getByRole('status')).toContainText('salvo');
  await page.reload();
  await expect(page.locator('.upload-photo')).toHaveCount(1);
  await expect(page.getByLabel('Arranjos', { exact: true })).not.toBeChecked();
  await expect(page.getByLabel('Flores', { exact: true })).toBeChecked();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1)).toBe(
    true
  );
  await page.screenshot({ path: info.outputPath('admin-produto.png'), fullPage: true });
});
test('cartão gratuito e cartão pago sob consulta não criam total fictício', async ({ page }) => {
  await pool.query('UPDATE site_settings SET card_enabled=true,card_price_cents=0');
  await openOrder(page);
  await page.getByLabel('Adicionar cartão', { exact: false }).check();
  await page.getByLabel('Mensagem do cartão', { exact: true }).fill('Feliz dia!');
  expect(await collectWhatsApp(page)).toContain('Subtotal estimado: R$ 149,90');
  await pool.query('UPDATE site_settings SET card_price_cents=700');
  await openOrder(page, 'tulipas');
  await page.getByLabel('Adicionar cartão', { exact: false }).check();
  await page.getByLabel('Mensagem do cartão', { exact: true }).fill('Com carinho');
  await expect(page.getByText('Subtotal estimado')).toHaveCount(0);
  const text = await collectWhatsApp(page);
  expect(text).toContain('7,00');
  expect(text).not.toContain('Subtotal');
});
test('upload inválido, sessão adulterada e requisição de outra origem são rejeitados', async ({
  page,
  request
}) => {
  await login(page);
  const invalid = await page.request.post('/admin/upload', {
    multipart: {
      file: { name: 'imagem.jpg', mimeType: 'image/jpeg', buffer: Buffer.from('not an image') }
    },
    headers: { origin: process.env.BASE_URL! }
  });
  expect(invalid.status()).toBe(400);
  const csrf = await page.request.post('/admin?/visibility', {
    form: { id: 'demo-rosas', publication: 'hidden' },
    headers: {
      origin: 'https://untrusted.example.test',
      'x-flora-host': 'untrusted.example.test',
      'x-flora-protocol': 'https'
    },
    maxRedirects: 0
  });
  expect(csrf.status()).toBe(403);
  await page.context().clearCookies();
  await page.context().addCookies([
    {
      name: 'better-auth.session_token',
      value: 'tampered.invalid-signature',
      url: process.env.BASE_URL!
    }
  ]);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/entrar/);
});
test('sair invalida a sessão no servidor', async ({ page }, info) => {
  const fs = await import('node:fs/promises');
  const state = JSON.parse(
    await fs.readFile(path.join(authDir, `logout-${info.project.name}.json`), 'utf8')
  );
  await page.context().addCookies(state.cookies);
  await page.goto('/admin');
  await page.getByRole('button', { name: 'Sair', exact: true }).click();
  await expect(page).toHaveURL(/\/entrar/);
  await page.context().addCookies(state.cookies);
  await page.goto('/admin');
  await expect(page).toHaveURL(/\/entrar/);
});

async function cleanupPhotoProduct(page: Page, id: string) {
  const [row] = (await pool.query('SELECT name FROM products WHERE id=$1', [id])).rows;
  if (row)
    await page.request.post('/admin?/delete', {
      form: { id, confirmation: row.name },
      headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
      maxRedirects: 0
    });
}

test('lote de onze fotos preserva preços, referências e links de cada opção', async ({
  page,
  request
}, info) => {
  test.setTimeout(120_000);
  await login(page);
  await page.goto('/admin/produtos/novo');
  await page.getByRole('radio', { name: 'Um preço por foto', exact: true }).check();
  const name = `Orquídeas lote ${info.project.name}`;
  await page.getByLabel('Nome do produto', { exact: true }).fill(name);
  await page
    .getByLabel('Descrição', { exact: true })
    .fill('Cada foto corresponde a uma orquídea com seu próprio preço.');
  await page.getByLabel('Visibilidade', { exact: true }).selectOption('published');
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile('static/demo-loja/orquidea-branca.webp');
  const imageIds = new Map<string, string>();
  let concurrent = 0;
  let peak = 0;
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname !== '/admin/upload' || !response.ok()) return;
    const photo = await response.json();
    imageIds.set(photo.alt, photo.id);
  });
  await page.route('**/admin/upload', async (route) => {
    concurrent++;
    peak = Math.max(peak, concurrent);
    try {
      await gate;
      // Delay native requests without replaying WebKit multipart uploads.
      await route.continue();
    } finally {
      concurrent--;
    }
  });
  let productId = '';
  try {
    await page.getByLabel('Escolher fotos', { exact: true }).setInputFiles(
      Array.from({ length: 11 }, (_, i) => ({
        name: `orquidea-${i + 1}.webp`,
        mimeType: 'image/webp',
        buffer
      }))
    );
    const rows = page.getByTestId('photo-option-editor');
    await expect(rows).toHaveCount(11);
    await expect(page.getByRole('button', { name: 'Salvar produto', exact: true })).toBeDisabled();
    for (let i = 0; i < 11; i++)
      await rows
        .nth(i)
        .getByLabel('Preço (R$)', { exact: true })
        .fill(String(100 + i * 10));
    await expect.poll(() => concurrent).toBe(1);
    expect(peak).toBeLessThanOrEqual(1);
    release();
    await expect(page.getByRole('button', { name: 'Salvar produto', exact: true })).toBeEnabled();
    await expect.poll(() => imageIds.size).toBe(11);
    expect(JSON.parse(await page.locator('input[name=mediaIds]').inputValue())).toEqual(
      Array.from({ length: 11 }, (_, i) => imageIds.get(`orquidea-${i + 1}.webp`))
    );
    if (info.project.use.hasTouch) {
      await expectReadableMobile(page);
      const viewport = page.viewportSize()!;
      await page.setViewportSize({ width: 320, height: 900 });
      const enlarged = await page.addStyleTag({ content: 'html { font-size: 200% !important; }' });
      await expectReadableMobile(page);
      await enlarged.evaluate((element) => element.parentNode?.removeChild(element));
      await page.setViewportSize(viewport);
    }
    await rows.first().screenshot({ path: info.outputPath('editor-preco-por-foto.png') });
    await rows.nth(3).getByLabel('Preço (R$)', { exact: true }).fill('-1');
    await saveProduct(page);
    await expect(page.getByRole('alert')).toContainText('opção 4');
    await expect(rows.nth(7).getByLabel('Preço (R$)', { exact: true })).toHaveValue('170');
    await rows.nth(3).getByLabel('Preço (R$)', { exact: true }).fill('130');
    await saveProduct(page);
    await expect(page.getByRole('status')).toContainText('criado');
    productId = page.url().split('/').pop()!.split('?')[0]!;
    const [product] = (await pool.query('SELECT slug, mode FROM products WHERE id=$1', [productId]))
      .rows;
    expect(product.mode).toBe('photo_variants');
    let choices = (
      await pool.query(
        'SELECT id, sku, image_id, price_cents FROM variants WHERE product_id=$1 ORDER BY position',
        [productId]
      )
    ).rows;
    expect(choices).toHaveLength(11);
    expect(new Set(choices.map((option) => option.sku)).size).toBe(11);
    for (let i = 0; i < 11; i++) {
      expect(choices[i].price_cents).toBe((100 + i * 10) * 100);
      expect(choices[i].image_id).toBe(imageIds.get(`orquidea-${i + 1}.webp`));
    }
    const chosen = choices[4];
    const deepLink = `/produtos/${product.slug}?opcao=${chosen.id}`;
    await page.goto(`/catalogo?q=${chosen.sku.toLowerCase()}`);
    await expect(page.getByTestId('product-card')).toHaveCount(1);
    await page.getByRole('link', { name: `Ver ${name}`, exact: true }).click();
    await expect(page).toHaveURL(new RegExp(`opcao=${chosen.id}`));
    await page.reload();
    await expect(page.locator('.detail-price')).toContainText('140,00');
    await expect(page.locator('.gallery-main img')).toHaveAttribute(
      'src',
      `/media/${chosen.image_id}`
    );
    await page.getByRole('button', { name: 'Pedir via WhatsApp' }).click();
    let message = await collectWhatsApp(page);
    expect(message).toContain(chosen.sku);
    expect(message).toContain('140,00');
    expect(message).toContain(deepLink);
    expect(message).not.toContain(choices[0].sku);
    await page.goto(`/admin/produtos/${productId}`);
    const editor = page.getByTestId('photo-option-editor');
    await editor
      .first()
      .getByLabel('Disponibilidade da opção', { exact: true })
      .selectOption('unavailable');
    await editor.nth(4).getByText('Identificação e exibição do preço', { exact: true }).click();
    await editor.nth(4).getByLabel('Exibir preço desta opção', { exact: true }).uncheck();
    await editor.nth(4).getByLabel('Preço (R$)', { exact: true }).fill('9876,54');
    await page.getByRole('button', { name: 'Mover foto 11 para antes', exact: true }).click();
    await saveProduct(page);
    await expect(page.getByRole('status')).toContainText('salvo');
    const publicHTML = await (await request.get(deepLink)).text();
    expect(publicHTML).not.toContain('987654');
    expect(publicHTML).not.toContain('9876,54');
    await page.goto(`/produtos/${product.slug}`);
    await expect(page.getByTestId('photo-option')).toHaveCount(11);
    if (info.project.use.hasTouch) await expectReadableMobile(page);
    await page.goto(`/produtos/${product.slug}?opcao=${choices[0].id}`);
    await expect(
      page.getByRole('button', { name: /Pedir via WhatsApp|Consultar disponibilidade/ })
    ).toHaveCount(0);
    expect(
      (
        await request.post(`/produtos/${product.slug}?/solicitar`, {
          form: { variantId: choices[0].id },
          headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
          maxRedirects: 0
        })
      ).status()
    ).toBe(409);
    await page.goto(deepLink);
    await page.getByRole('button', { name: 'Pedir via WhatsApp' }).click();
    message = await collectWhatsApp(page);
    expect(message).toContain(chosen.sku);
    expect(message).toContain('consultar o preço');
    expect(message).not.toContain('9876');
    await page.goto(`/admin/produtos/${productId}`);
    await page.getByRole('button', { name: 'Remover foto 2', exact: true }).click();
    await saveProduct(page);
    await expect(page.getByRole('status')).toContainText('salvo');
    expect((await request.get(`/produtos/${product.slug}?opcao=${choices[1].id}`)).status()).toBe(
      404
    );
    expect((await request.get(`/media/${choices[1].image_id}`)).status()).toBe(404);
    expect((await request.get(deepLink)).status()).toBe(200);
    choices = (await pool.query('SELECT id FROM variants WHERE product_id=$1', [productId])).rows;
    expect(choices).toHaveLength(10);
    expect(choices.some((option) => option.id === chosen.id)).toBe(true);
    await page.goto(`/produtos/${product.slug}`);
    await page.screenshot({ path: info.outputPath('opcoes-por-foto.png'), fullPage: true });
  } finally {
    release();
    if (productId) await cleanupPhotoProduct(page, productId);
  }
});

test('servidor valida vínculos das opções e mantém o produto inteiro em uma falha', async ({
  page,
  request
}, info) => {
  await login(page);
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile('static/demo-loja/orquidea-rajada.webp');
  const origin = process.env.BASE_URL!;
  const headers = { origin, accept: 'text/html' };
  const created: string[] = [];
  async function create(name: string) {
    const photo = await (
      await page.request.post('/admin/upload', {
        multipart: { file: { name: 'orquidea.webp', mimeType: 'image/webp', buffer } },
        headers: { origin }
      })
    ).json();
    const option = {
      id: '',
      imageId: photo.id,
      name: '',
      sku: '',
      price: '150',
      showPrice: true,
      availability: 'available'
    };
    const form = {
      name,
      description: 'Opção de teste',
      mode: 'photo_variants',
      publication: 'published',
      mediaIds: JSON.stringify([photo.id]),
      variants: JSON.stringify([option])
    };
    const response = await page.request.post('/admin/produtos/novo', {
      form,
      headers,
      maxRedirects: 0
    });
    expect(response.status()).toBe(303);
    const id = response.headers().location!.split('/').pop()!.split('?')[0]!;
    created.push(id);
    const [product] = (await pool.query('SELECT slug FROM products WHERE id=$1', [id])).rows;
    const [stored] = (await pool.query('SELECT * FROM variants WHERE product_id=$1', [id])).rows;
    return {
      id,
      slug: product.slug,
      form,
      option: { ...option, id: stored.id, sku: stored.sku },
      stored
    };
  }
  try {
    const a = await create(`Orquídea A ${info.project.name}`);
    const b = await create(`Orquídea B ${info.project.name}`);
    const invalidOptions = [
      [{ ...a.option, id: b.option.id }],
      [{ ...a.option, imageId: b.option.imageId }],
      [{ ...a.option, sku: b.option.sku }],
      [{ ...a.option, price: '' }]
    ];
    for (const choices of invalidOptions) {
      const response = await page.request.post(`/admin/produtos/${a.id}`, {
        form: {
          ...a.form,
          name: 'Não deve salvar',
          mediaIds: JSON.stringify(choices.map((option) => option.imageId)),
          variants: JSON.stringify(choices)
        },
        headers,
        maxRedirects: 0
      });
      expect(response.status()).toBe(400);
      const [after] = (await pool.query('SELECT name FROM products WHERE id=$1', [a.id])).rows;
      expect(after.name).toBe(a.form.name);
      const [variant] = (await pool.query('SELECT * FROM variants WHERE product_id=$1', [a.id]))
        .rows;
      expect(variant.id).toBe(a.stored.id);
      expect(variant.image_id).toBe(a.stored.image_id);
      expect(variant.price_cents).toBe(15000);
    }
    expect((await request.get(`/produtos/${a.slug}?opcao=${b.option.id}`)).status()).toBe(404);
    expect(
      (
        await request.post(`/produtos/${a.slug}?/solicitar`, {
          form: { variantId: b.option.id },
          headers,
          maxRedirects: 0
        })
      ).status()
    ).toBe(400);
    expect(
      (
        await request.post(`/produtos/${a.slug}?/solicitar`, { form: {}, headers, maxRedirects: 0 })
      ).status()
    ).toBe(400);
    expect((await request.get(`/media/${a.option.imageId}`)).status()).toBe(200);
    expect((await request.get(`/media/${b.option.imageId}`)).status()).toBe(200);
  } finally {
    for (const id of created) await cleanupPhotoProduct(page, id);
  }
});

test('converter galeria existente mantém fotos e a referência original', async ({ page }, info) => {
  await login(page);
  await page.goto('/admin/produtos/novo');
  const name = `Converter galeria ${info.project.name}`;
  await page.getByLabel('Nome do produto', { exact: true }).fill(name);
  await page.getByLabel('Preço (R$)', { exact: true }).fill('120');
  await page.getByLabel('Visibilidade', { exact: true }).selectOption('published');
  await selectPhotos(page, ['static/demo/rosas-vermelhas.jpg', 'static/demo/girassois.jpg']);
  await expect(page.getByRole('button', { name: 'Salvar produto', exact: true })).toBeEnabled();
  await saveProduct(page);
  await expect(page.getByRole('status')).toContainText('criado');
  const id = page.url().split('/').pop()!.split('?')[0]!;
  try {
    const [original] = (await pool.query('SELECT id, sku FROM variants WHERE product_id=$1', [id]))
      .rows;
    const photos = JSON.parse(await page.locator('input[name=mediaIds]').inputValue());
    await page.getByLabel('Preço (R$)', { exact: true }).fill('125');
    await page.getByRole('radio', { name: 'Um preço por foto', exact: true }).check();
    const options = page.getByTestId('photo-option-editor');
    await expect(options).toHaveCount(2);
    await expect(options.first().getByLabel('Preço (R$)', { exact: true })).toHaveValue('125');
    await options.nth(1).getByLabel('Preço (R$)', { exact: true }).fill('170');
    await saveProduct(page);
    await expect(page.getByRole('status')).toContainText('salvo');
    let choices = (
      await pool.query(
        'SELECT id, sku, image_id, price_cents FROM variants WHERE product_id=$1 ORDER BY position',
        [id]
      )
    ).rows;
    expect(choices.map((option) => option.image_id)).toEqual(photos);
    expect(choices[0].id).toBe(original.id);
    expect(choices[0].sku).toBe(original.sku);
    expect(choices[0].price_cents).toBe(12500);
    expect(choices[1].price_cents).toBe(17000);
    await options.nth(1).getByLabel('Preço (R$)', { exact: true }).fill('175');
    await saveProduct(page);
    await expect(page.getByRole('status')).toContainText('salvo');
    const next = (
      await pool.query(
        'SELECT id, price_cents FROM variants WHERE product_id=$1 ORDER BY position',
        [id]
      )
    ).rows;
    expect(next.map((option) => option.id)).toEqual(choices.map((option) => option.id));
    expect(next[1].price_cents).toBe(17500);
    const bad = await page.request.post(`/admin/produtos/${id}`, {
      form: {
        name,
        mode: 'standard',
        price: '10',
        showPrice: 'on',
        publication: 'published',
        mediaIds: JSON.stringify(photos)
      },
      headers: { origin: process.env.BASE_URL!, accept: 'text/html' },
      maxRedirects: 0
    });
    expect(bad.status()).toBe(400);
    expect(
      (await pool.query('SELECT id FROM variants WHERE product_id=$1', [id])).rows
    ).toHaveLength(2);
  } finally {
    await cleanupPhotoProduct(page, id);
  }
});

test('onze fotos: falha de conexão pausa a fila, repetir funciona e permite novos lotes', async ({
  page
}, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.goto('/admin/produtos/novo');
  await page.getByRole('radio', { name: 'Um preço por foto', exact: true }).check();
  await page
    .getByLabel('Nome do produto', { exact: true })
    .fill(`Fila celular ${info.project.name}`);
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile('static/demo-loja/orquidea-rajada.webp');
  const images = Array.from({ length: 13 }, (_, i) => ({
    name: `fila-${i + 1}.webp`,
    mimeType: 'image/webp',
    buffer
  }));
  let release!: () => void;
  const gate = new Promise<void>((resolve) => {
    release = resolve;
  });
  let attempts = 0;
  const received = new Map<string, string>();
  page.on('response', async (response) => {
    if (new URL(response.url()).pathname !== '/admin/upload' || !response.ok()) return;
    const photo = await response.json();
    received.set(photo.alt, photo.id);
  });
  await page.route('**/admin/upload', async (route) => {
    attempts++;
    await gate;
    if (attempts === 3) await route.abort('connectionfailed');
    else await route.continue();
  });
  let productId = '';
  try {
    await selectPhotos(page, images.slice(0, 11));
    const rows = page.getByTestId('photo-option-editor');
    await expect(rows).toHaveCount(11);
    await expect
      .poll(() =>
        rows.first().evaluate((element) => Math.round(element.getBoundingClientRect().top))
      )
      .toBe(16);
    for (let i = 0; i < 11; i++)
      await rows
        .nth(i)
        .getByLabel('Preço (R$)', { exact: true })
        .fill(String(100 + i));
    await expect.poll(() => attempts).toBe(1);
    release();
    await expect(rows.nth(2).getByRole('alert')).toContainText('Falha de conexão');
    await expect(rows.nth(3)).toContainText('Aguardando nova tentativa');
    expect(attempts).toBe(3);
    await expect(rows.nth(2).getByLabel('Preço (R$)', { exact: true })).toHaveValue('102');
    await expect(page.getByRole('button', { name: 'Salvar produto', exact: true })).toBeDisabled();
    await selectPhotos(page, images.slice(11));
    await expect(rows).toHaveCount(13);
    await expect
      .poll(() =>
        rows.nth(11).evaluate((element) => Math.round(element.getBoundingClientRect().top))
      )
      .toBe(16);
    await rows.nth(11).getByLabel('Preço (R$)', { exact: true }).fill('111');
    await rows.nth(12).getByLabel('Preço (R$)', { exact: true }).fill('112');
    await rows.nth(4).getByRole('button', { name: 'Cancelar envio', exact: true }).click();
    await expect(rows).toHaveCount(12);
    expect(attempts).toBe(3);
    await rows.nth(2).getByRole('button', { name: 'Tentar novamente', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Salvar produto', exact: true })).toBeEnabled({
      timeout: 30_000
    });
    await expect.poll(() => received.size).toBe(12);
    expect(attempts).toBe(13);
    expect(JSON.parse(await page.locator('input[name=mediaIds]').inputValue())).toEqual(
      images.filter((_, i) => i !== 4).map((image) => received.get(image.name))
    );
    await expect(rows.nth(2).getByLabel('Preço (R$)', { exact: true })).toHaveValue('102');
    await saveProduct(page);
    await expect(page.getByRole('status')).toContainText('criado');
    productId = page.url().split('/').pop()!.split('?')[0]!;
    const [product] = (
      await pool.query('SELECT publication FROM products WHERE id=$1', [productId])
    ).rows;
    expect(product.publication).toBe('draft');
    expect(
      (await pool.query('SELECT id FROM variants WHERE product_id=$1', [productId])).rowCount
    ).toBe(12);
  } finally {
    release();
    if (productId) await cleanupPhotoProduct(page, productId);
  }
});

test('nove fotos: leitura temporária recupera e nova seleção substitui falhas sem perder preços', async ({
  page
}, info) => {
  test.setTimeout(120_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await page.addInitScript(() => {
    const original = FileReader.prototype.readAsArrayBuffer;
    const sources = new Map<string, Blob>();
    const attempts = new Map<Blob, number>();
    FileReader.prototype.readAsArrayBuffer = function (blob: Blob) {
      if (blob instanceof File && /^leitura-[1-9]\.webp$/.test(blob.name)) {
        if (!sources.has(blob.name)) sources.set(blob.name, blob);
        const count = (attempts.get(blob) ?? 0) + 1;
        attempts.set(blob, count);
        const index = Number(blob.name.match(/\d+/)![0]);
        if (
          (index === 1 && count < 3) ||
          (index >= 3 && index <= 8 && sources.get(blob.name) === blob)
        )
          throw new DOMException('Temporary native photo access failure', 'NotReadableError');
      }
      return original.call(this, blob);
    };
  });
  await login(page);
  await page.goto('/admin/produtos/novo');
  await page.getByRole('radio', { name: 'Um preço por foto', exact: true }).check();
  await page
    .getByLabel('Nome do produto', { exact: true })
    .fill(`Leitura celular ${info.project.name}`);
  const { readFile } = await import('node:fs/promises');
  const buffer = await readFile('static/demo-loja/orquidea-branca.webp');
  const files = Array.from({ length: 9 }, (_, i) => ({
    name: `leitura-${i + 1}.webp`,
    mimeType: 'image/webp',
    buffer
  }));
  let productId = '';
  try {
    await selectPhotos(page, files);
    const rows = page.getByTestId('photo-option-editor');
    await expect(rows).toHaveCount(9);
    await expect
      .poll(() =>
        rows.first().evaluate((element) => Math.round(element.getBoundingClientRect().top))
      )
      .toBe(16);
    for (let i = 0; i < 9; i++)
      await rows
        .nth(i)
        .getByLabel('Preço (R$)', { exact: true })
        .fill(String(100 + i));
    await expect(page.getByRole('alert')).toHaveCount(6);
    await expect
      .poll(async () => JSON.parse(await page.locator('input[name=mediaIds]').inputValue()).length)
      .toBe(3);
    const existing = JSON.parse(await page.locator('input[name=mediaIds]').inputValue());
    await expect(rows.first().getByRole('alert')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Salvar produto', exact: true })).toBeDisabled();
    await rows.nth(2).screenshot({ path: info.outputPath('fotos-reselecionar.png') });
    for (let i = 2; i <= 7; i++) {
      const row = rows.nth(i);
      await expect(row.getByRole('button', { name: 'Tentar novamente', exact: true })).toHaveCount(
        0
      );
      await expect(row.getByLabel('Preço (R$)', { exact: true })).toHaveValue(String(100 + i));
      const chooser = page.waitForEvent('filechooser');
      await row.getByRole('button', { name: 'Selecionar foto novamente', exact: true }).click();
      await (await chooser).setFiles(files[i]!);
      await expect(row.getByRole('alert')).toHaveCount(0);
      await expect(row.getByLabel('Preço (R$)', { exact: true })).toHaveValue(String(100 + i));
      await expect(rows).toHaveCount(9);
    }
    await expect(page.getByRole('button', { name: 'Salvar produto', exact: true })).toBeEnabled({
      timeout: 30_000
    });
    const completed = JSON.parse(await page.locator('input[name=mediaIds]').inputValue());
    expect(completed).toHaveLength(9);
    expect(new Set(completed).size).toBe(9);
    expect(completed[0]).toBe(existing[0]);
    expect(completed[1]).toBe(existing[1]);
    expect(completed[8]).toBe(existing[2]);
    if (info.project.use.hasTouch) await expectReadableMobile(page);
    await saveProduct(page);
    await expect(page.getByRole('status')).toContainText('criado');
    productId = page.url().split('/').pop()!.split('?')[0]!;
    const variants = (
      await pool.query('SELECT price_cents FROM variants WHERE product_id=$1 ORDER BY position', [
        productId
      ])
    ).rows;
    expect(variants.map((variant) => variant.price_cents)).toEqual(
      Array.from({ length: 9 }, (_, i) => (100 + i) * 100)
    );
  } finally {
    if (productId) await cleanupPhotoProduct(page, productId);
  }
});

test('toasts ficam no topo ao salvar, repetem a confirmação e desaparecem automaticamente', async ({
  page
}, info) => {
  test.setTimeout(90_000);
  await page.emulateMedia({ reducedMotion: 'reduce' });
  await login(page);
  await page.goto('/admin/produtos/novo');
  await page.getByLabel('Nome do produto', { exact: true }).fill(`Avisos ${info.project.name}`);
  const price = page.getByLabel('Preço (R$)', { exact: true });
  await expect(price).toHaveAttribute('placeholder', '0,00');
  await price.fill('10');
  const notifications = page.locator('[data-sonner-toast]');
  let productId = '';
  try {
    await saveProduct(page);
    await expect(notifications).toContainText('Produto criado com carinho.');
    productId = page.url().split('/').pop()!.split('?')[0]!;
    await notifications.getByRole('button', { name: 'Fechar notificação', exact: true }).click();
    await expect(notifications).toHaveCount(0);
    await page.evaluate(() => scrollTo(0, document.documentElement.scrollHeight));
    await saveProduct(page);
    await expect(notifications).toHaveCount(1);
    await expect(notifications).toContainText('Produto salvo com carinho.');
    const metrics = await notifications.evaluate((element) => ({
      top: element.getBoundingClientRect().top,
      left: element.getBoundingClientRect().left,
      right: element.getBoundingClientRect().right,
      viewport: innerWidth,
      scroll: scrollY,
      font: parseFloat(getComputedStyle(element.querySelector('[data-title]')!).fontSize)
    }));
    expect(metrics.scroll).toBeGreaterThan(200);
    expect(metrics.top).toBeGreaterThanOrEqual(0);
    expect(metrics.top).toBeLessThan(40);
    expect(metrics.left).toBeGreaterThanOrEqual(0);
    expect(metrics.right).toBeLessThanOrEqual(metrics.viewport + 1);
    expect(metrics.font).toBeGreaterThanOrEqual(16);
    expect(
      (await notifications
        .getByRole('button', { name: 'Fechar notificação', exact: true })
        .boundingBox())!.height
    ).toBeGreaterThanOrEqual(44);
    await page.screenshot({ path: info.outputPath('toast-produto-salvo.png') });
    await saveProduct(page);
    await expect(notifications).toHaveCount(1);
    await expect(notifications).toContainText('Produto salvo com carinho.');
    await notifications.getByRole('button', { name: 'Fechar notificação', exact: true }).click();
    await expect(notifications).toHaveCount(0);
    await saveProduct(page);
    await expect(notifications).toContainText('Produto salvo com carinho.');
    await page.mouse.move(0, 0);
    await expect(notifications).toHaveCount(0, { timeout: 8_000 });
    await price.fill('-1');
    await saveProduct(page);
    await expect(notifications).toHaveAttribute('data-type', 'error');
    await expect(notifications).toContainText('preço válido');
    await notifications.getByRole('button', { name: 'Fechar notificação', exact: true }).click();
    await expect(notifications).toHaveCount(0);
    await expect(page.getByRole('alert')).toContainText('preço válido');
    await expect(price).toHaveValue('-1');
    await price.fill('12');
    await saveProduct(page);
    await expect(notifications).toHaveAttribute('data-type', 'success');
    await expect(notifications).toContainText('Produto salvo com carinho.');
    if (info.project.use.hasTouch) await expectReadableMobile(page);
    await page.goto('/admin/configuracoes');
    const saved = page.waitForResponse(
      (response) =>
        response.request().method() === 'POST' &&
        new URL(response.url()).pathname === '/admin/configuracoes'
    );
    await page.getByRole('button', { name: /Salvar informações/ }).click();
    await saved;
    await expect(notifications).toHaveAttribute('data-type', 'success');
    await expect(notifications).toContainText('Informações da loja atualizadas.');
  } finally {
    if (productId) await cleanupPhotoProduct(page, productId);
  }
});
