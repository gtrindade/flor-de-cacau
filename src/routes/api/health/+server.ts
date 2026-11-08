import { json } from '@sveltejs/kit';
import { pool } from '#lib/server/db';
export const GET = async () => {
  try {
    await pool.query('select 1');
    return json({ status: 'ok' });
  } catch {
    return json({ status: 'unavailable' }, { status: 503 });
  }
};
