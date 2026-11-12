import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  parseMoney,
  openingStatus,
  defaultHours,
  buildWhatsAppMessage,
  productOptionPath,
  productPriceLabel
} from '../../src/lib/domain';
import { isAdminIdentity, authOptions } from '../../src/lib/server/auth-options';
test('BRL uses integer cents and rejects ambiguous or malformed amounts', () => {
  assert.equal(parseMoney('1.234,56'), 123456);
  assert.equal(parseMoney('12,3'), 1230);
  assert.equal(parseMoney('0'), 0);
  assert.equal(parseMoney(''), null);
  for (const bad of ['-1', 'NaN', '1.234', '12,999', '1e3']) assert.throws(() => parseMoney(bad));
});
test('photo option links keep identity and price summaries never expose private prices', () => {
  assert.equal(productOptionPath('orquideas', 'choice-2'), '/produtos/orquideas?opcao=choice-2');
  const option = { priceCents: 12000, showPrice: true, availability: 'available' };
  const product = {
    mode: 'photo_variants',
    variant: option,
    variants: [option, { ...option, priceCents: 18000 }]
  };
  assert.match(productPriceLabel(product), /A partir de.*120,00/);
  assert.doesNotMatch(
    productPriceLabel({
      ...product,
      variants: [option, { ...option, showPrice: false, priceCents: 987654 }]
    }),
    /987|120/
  );
  assert.match(
    productPriceLabel({
      ...product,
      variants: [option, { ...option, availability: 'unavailable', priceCents: 5000 }]
    }),
    /120,00/
  );
  const message = buildWhatsAppMessage({
    productName: 'Orquídeas',
    variantName: 'Orquídea branca',
    sku: 'FC-OPCAO-2',
    priceCents: 18000,
    delivery: 'pickup',
    card: false,
    cardPriceCents: null,
    productUrl: 'https://flora.test/produtos/orquideas?opcao=choice-2'
  });
  assert.match(message, /Opção: Orquídea branca/);
  assert.match(message, /Referência: FC-OPCAO-2/);
  assert.match(message, /\?opcao=choice-2/);
});
test('hours use São Paulo timezone with inclusive opening and exclusive closing', () => {
  assert.equal(openingStatus(defaultHours, new Date('2026-11-04T12:00:00Z')).open, true);
  assert.equal(openingStatus(defaultHours, new Date('2026-11-04T21:00:00Z')).open, false);
  assert.equal(openingStatus(defaultHours, new Date('2026-11-08T15:00:00Z')).open, false);
  assert.equal(openingStatus(defaultHours, new Date('2026-11-05T01:00:00Z')).today, '2026-11-04');
});
test('WhatsApp request includes card and delivery but never hidden base price', () => {
  const input = {
    productName: 'Rosas & afeto',
    sku: 'FC-1',
    priceCents: null,
    delivery: 'delivery',
    postalCode: '34590290',
    street: 'Rua das Flores',
    number: '123-A',
    complement: 'Apto 201',
    district: 'Centro',
    city: 'Sabará',
    state: 'MG',
    reference: 'Próximo à praça',
    card: true,
    cardMessage: 'Com amor ❤️',
    cardPriceCents: 500,
    note: 'Capriche!',
    productUrl: 'http://example.test/produtos/rosas'
  };
  const message = buildWhatsAppMessage(input);
  assert.match(message, /consultar o preço/);
  assert.match(message, /Centro, Sabará/);
  assert.match(message, /Rua das Flores, 123-A/);
  assert.match(message, /Complemento: Apto 201/);
  assert.match(message, /Sabará\/MG/);
  assert.match(message, /CEP: 34590-290/);
  assert.match(message, /Ponto de referência: Próximo à praça/);
  assert.match(message, /Com amor ❤️/);
  assert.doesNotMatch(message, /Subtotal|Preço anunciado/);
  assert.match(buildWhatsAppMessage({ ...input, priceCents: 14990 }), /154,90/);
  const pickup = buildWhatsAppMessage({ ...input, delivery: 'pickup' });
  assert.match(pickup, /Retirada na floricultura/);
  assert.doesNotMatch(pickup, /Rua das Flores|Apto 201|34590|Próximo à praça|Taxa a combinar/);
});
test('delivery message accepts an already formatted CEP and omits blank optional address fields', () => {
  const message = buildWhatsAppMessage({
    productName: 'Arranjo',
    sku: 'FC-002',
    priceCents: 9900,
    delivery: 'delivery',
    postalCode: '34590-290',
    street: 'Estrada das Flores',
    number: 's/n',
    district: 'Centro',
    city: 'Sabará',
    state: 'MG',
    complement: ' ',
    reference: '',
    card: false,
    cardPriceCents: null,
    productUrl: 'http://example.test/produtos/arranjo'
  });
  assert.match(message, /Estrada das Flores, s\/n/);
  assert.match(message, /CEP: 34590-290/);
  assert.doesNotMatch(message, /Complemento:|Ponto de referência:|undefined/);
});
test('Google identity gate requires verified allowlisted Google user info', async () => {
  const original = process.env.ADMIN_EMAILS;
  process.env.ADMIN_EMAILS = 'allowed@example.test';
  try {
    assert.equal(isAdminIdentity({ email: 'ALLOWED@example.test', emailVerified: true }), true);
    assert.equal(isAdminIdentity({ email: 'allowed@example.test', emailVerified: false }), false);
    assert.equal(isAdminIdentity({ email: 'other@example.test', emailVerified: true }), false);
    const validate = authOptions.user.validateUserInfo;
    const call = (person: object, provider = 'google', method = 'oauth') =>
      validate({ user: person, source: { method, oauth: { providerId: provider } } } as never);
    assert.equal(await call({ email: 'allowed@example.test', emailVerified: true }), undefined);
    for (const [person, provider] of [
      [{ email: 'other@example.test', emailVerified: true }, 'google'],
      [{ email: 'allowed@example.test', emailVerified: false }, 'google'],
      [{ email: 'allowed@example.test', emailVerified: true }, 'facebook']
    ] as const)
      assert.equal((await call(person, provider))?.error, 'access_denied');
  } finally {
    if (original === undefined) delete process.env.ADMIN_EMAILS;
    else process.env.ADMIN_EMAILS = original;
  }
});
