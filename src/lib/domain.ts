export const availabilityLabels = {
  available: 'Disponível',
  on_request: 'Sob encomenda',
  check: 'Consulte disponibilidade',
  unavailable: 'Indisponível'
} as const;
export type Availability = keyof typeof availabilityLabels;
export type ProductMode = 'standard' | 'photo_variants';
export function productOptionPath(slug: string, optionId?: string | null) {
  return `/produtos/${encodeURIComponent(slug)}${optionId ? `?opcao=${encodeURIComponent(optionId)}` : ''}`;
}
export function productPriceLabel(product: {
  mode: string;
  variant: { priceCents: number | null };
  variants: { priceCents: number | null; showPrice: boolean; availability: string }[];
}) {
  if (product.mode === 'standard')
    return product.variant.priceCents === null
      ? 'Consulte o valor'
      : money(product.variant.priceCents);
  const selectable = product.variants.filter((v) => v.availability !== 'unavailable');
  const choices = selectable.length ? selectable : product.variants;
  if (!choices.length || choices.some((v) => !v.showPrice || v.priceCents === null))
    return 'Veja os valores por opção';
  const prices = choices.map((v) => v.priceCents!);
  const minimum = prices.reduce((minimum, price) => Math.min(minimum, price), Infinity);
  return prices.every((p) => p === minimum) ? money(minimum) : `A partir de ${money(minimum)}`;
}
export const brazilianStates = [
  'AC',
  'AL',
  'AP',
  'AM',
  'BA',
  'CE',
  'DF',
  'ES',
  'GO',
  'MA',
  'MT',
  'MS',
  'MG',
  'PA',
  'PB',
  'PR',
  'PE',
  'PI',
  'RJ',
  'RN',
  'RS',
  'RO',
  'RR',
  'SC',
  'SP',
  'SE',
  'TO'
] as const;
export type WeeklyHours = Record<string, { open: string; close: string } | null>;
export const weekdays = [
  { id: 'mon', label: 'Segunda-feira' },
  { id: 'tue', label: 'Terça-feira' },
  { id: 'wed', label: 'Quarta-feira' },
  { id: 'thu', label: 'Quinta-feira' },
  { id: 'fri', label: 'Sexta-feira' },
  { id: 'sat', label: 'Sábado' },
  { id: 'sun', label: 'Domingo' }
];
export const defaultHours: WeeklyHours = {
  mon: { open: '09:00', close: '18:00' },
  tue: { open: '09:00', close: '18:00' },
  wed: { open: '09:00', close: '18:00' },
  thu: { open: '09:00', close: '18:00' },
  fri: { open: '09:00', close: '18:00' },
  sat: { open: '09:00', close: '14:00' },
  sun: null
};
export const money = (cents: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(cents / 100);
export function parseMoney(input: string): number | null {
  let value = input
    .trim()
    .replace(/R\$\s*/g, '')
    .replace(/\s/g, '');
  if (!value) return null;
  if (value.includes(',')) value = value.replace(/\./g, '').replace(',', '.');
  if (!/^\d+(\.\d{1,2})?$/.test(value)) throw new Error('Informe um preço válido, como 129,90.');
  const [whole = '0', decimal = ''] = value.split('.');
  const cents = Number(whole) * 100 + Number(decimal.padEnd(2, '0'));
  if (!Number.isSafeInteger(cents) || cents > 100_000_000)
    throw new Error('O preço informado é muito alto.');
  return cents;
}
export function slugify(value: string) {
  return value
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '');
}
export function localDate(now: Date) {
  const parts = new Intl.DateTimeFormat('en-CA', {
    timeZone: 'America/Sao_Paulo',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit'
  }).formatToParts(now);
  const get = (key: string) => parts.find((p) => p.type === key)?.value;
  return `${get('year')}-${get('month')}-${get('day')}`;
}
export function openingStatus(hours: WeeklyHours, now: Date) {
  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/Sao_Paulo',
    weekday: 'short',
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23'
  }).formatToParts(now);
  const day = parts.find((p) => p.type === 'weekday')?.value.toLowerCase() ?? '';
  const time = `${parts.find((p) => p.type === 'hour')?.value}:${parts.find((p) => p.type === 'minute')?.value}`;
  const interval = hours[day];
  const open = !!interval && time >= interval.open && time < interval.close;
  return {
    open,
    today: localDate(now),
    label: open
      ? `Atendimento até ${interval!.close.replace(':', 'h')}`
      : 'Fora do horário de atendimento'
  };
}
export function buildWhatsAppMessage(input: {
  productName: string;
  variantName?: string;
  sku: string;
  priceCents: number | null;
  date?: string;
  period?: string;
  time?: string;
  delivery: string;
  postalCode?: string;
  street?: string;
  number?: string;
  complement?: string;
  district?: string;
  city?: string;
  state?: string;
  reference?: string;
  note?: string;
  card: boolean;
  cardMessage?: string;
  cardPriceCents: number | null;
  productUrl: string;
}) {
  const lines = [`Olá, Flor de Cacau! Tenho interesse em ${input.productName}.`];
  if (input.variantName) lines.push(`Opção: ${input.variantName}`);
  lines.push(`Referência: ${input.sku}`);
  if (input.priceCents !== null) lines.push(`Preço anunciado: ${money(input.priceCents)}`);
  else lines.push('Gostaria de consultar o preço.');
  const date = input.date ? input.date.split('-').reverse().join('/') : 'Ainda não sei';
  lines.push(
    `Data desejada: ${date}`,
    `Período/horário: ${input.period === 'horario' ? input.time || 'A combinar' : ({ manha: 'Manhã', tarde: 'Tarde' }[input.period ?? ''] ?? 'A combinar')}`
  );
  if (input.delivery === 'delivery') {
    lines.push('Entrega no endereço:', `${input.street}, ${input.number}`);
    if (input.complement?.trim()) lines.push(`Complemento: ${input.complement.trim()}`);
    lines.push(
      `${input.district}, ${input.city}/${input.state}`,
      `CEP: ${input.postalCode?.replace(/^(\d{5})-?(\d{3})$/, '$1-$2')}`
    );
    if (input.reference?.trim()) lines.push(`Ponto de referência: ${input.reference.trim()}`);
    lines.push('Taxa a combinar.');
  } else lines.push('Retirada na floricultura.');
  if (input.card) {
    lines.push(
      `Adicionar cartão: ${money(input.cardPriceCents ?? 0)}`,
      `Mensagem do cartão: ${input.cardMessage}`
    );
    if (input.priceCents !== null)
      lines.push(`Subtotal estimado: ${money(input.priceCents + (input.cardPriceCents ?? 0))}`);
  }
  if (input.note) lines.push(`Observação: ${input.note}`);
  lines.push('Podemos confirmar disponibilidade e os detalhes?', input.productUrl);
  return lines.join('\n');
}
