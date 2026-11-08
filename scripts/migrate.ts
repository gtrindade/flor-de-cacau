import { migrate } from 'drizzle-orm/node-postgres/migrator';
import { db, pool } from '../src/lib/server/db/index';
try {
  await migrate(db, { migrationsFolder: './drizzle' });
  console.log('Migrations aplicadas.');
} finally {
  await pool.end();
}
