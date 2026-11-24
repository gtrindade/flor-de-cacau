import { parseArgs } from 'node:util';
import { mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { pool } from '../src/lib/server/db/index';
import { planProductSplit, splitProduct } from '../src/lib/server/product-bundles';

try {
  const { values } = parseArgs({
    options: {
      product: { type: 'string' },
      'expect-count': { type: 'string' },
      'expect-fingerprint': { type: 'string' },
      snapshot: { type: 'string' },
      apply: { type: 'boolean', default: false }
    }
  });
  const id = values.product;
  const count = Number(values['expect-count']);
  if (!id || !Number.isSafeInteger(count) || count < 2)
    throw new Error('Use --product ID --expect-count N. Sem --apply, apenas o plano é consultado.');
  const plan = await planProductSplit(id, count);
  if (!values.apply) {
    console.log(
      JSON.stringify(
        {
          productId: id,
          name: plan.snapshot.product.name,
          count: plan.count,
          fingerprint: plan.fingerprint,
          options: plan.snapshot.options.map((option) => ({
            id: option.id,
            name: option.name,
            sku: option.sku,
            priceCents: option.priceCents,
            showPrice: option.showPrice,
            availability: option.availability
          }))
        },
        null,
        2
      )
    );
  } else {
    if (values['expect-fingerprint'] !== plan.fingerprint || !values.snapshot)
      throw new Error(
        'Para aplicar, informe --expect-fingerprint do plano e --snapshot com um arquivo novo.'
      );
    const snapshot = path.resolve(values.snapshot);
    await mkdir(path.dirname(snapshot), { recursive: true, mode: 0o700 });
    await writeFile(snapshot, JSON.stringify(plan, null, 2), { mode: 0o600, flag: 'wx' });
    const created = await splitProduct(id, count, plan.fingerprint);
    const receipt = { sourceId: id, createdCount: created.length, products: created, snapshot };
    try {
      await writeFile(`${snapshot}.result.json`, JSON.stringify(receipt, null, 2), {
        mode: 0o600,
        flag: 'wx'
      });
    } catch {
      console.error(
        'A separação foi aplicada; não foi possível gravar o recibo. O snapshot anterior permanece salvo.'
      );
    }
    console.log(JSON.stringify(receipt, null, 2));
  }
} catch (cause) {
  console.error(cause instanceof Error ? cause.message : 'Não foi possível separar o produto.');
  process.exitCode = 1;
} finally {
  await pool.end();
}
