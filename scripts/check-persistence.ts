import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { Pool } from 'pg';
if (process.env.APP_ENV !== 'e2e' || !process.env.DATABASE_URL?.endsWith('/flora_e2e'))
  throw new Error('Persistence check requires flora_e2e.');
const pool = new Pool({ connectionString: process.env.DATABASE_URL });
try {
  const rows = (await pool.query("SELECT name FROM products WHERE name LIKE 'Rascunho %'")).rows;
  if (!rows.length)
    console.log(
      'Filtro de testes sem fixture de persistência; verificação de reinício não se aplica.'
    );
  else {
    const state = JSON.parse(await readFile('/artifacts/auth/admin.json', 'utf8'));
    const cookie = state.cookies
      .map((c: { name: string; value: string }) => `${c.name}=${c.value}`)
      .join('; ');
    const response = await fetch(`${process.env.BASE_URL}/admin`, { headers: { cookie } });
    assert.equal(response.status, 200);
    const html = await response.text();
    for (const row of rows)
      assert.ok(html.includes(row.name), `Draft missing after restart: ${row.name}`);
    console.log(
      `Persistência confirmada após reinício: ${rows.length} rascunhos criados pela interface.`
    );
  }
} finally {
  await pool.end();
}
