// This script runs only in the disposable E2E init container. No HTTP test login route exists.
import { mkdir, writeFile } from 'node:fs/promises';
import { betterAuth } from 'better-auth';
import { testUtils } from 'better-auth/plugins';
import { authOptions } from '../src/lib/server/auth-options';
import { db, pool } from '../src/lib/server/db';
import { user } from '../src/lib/server/db/schema';
if (process.env.APP_ENV !== 'e2e' || !process.env.DATABASE_URL?.endsWith('/flora_e2e'))
  throw new Error('Test auth is restricted to flora_e2e.');
await db.insert(user).values([
  { id: 'test-admin', name: 'Admin de Teste', email: 'admin@example.test', emailVerified: true },
  {
    id: 'test-outsider',
    name: 'Conta revogada',
    email: 'outsider@example.test',
    emailVerified: true
  }
]);
const auth = betterAuth({ ...authOptions, plugins: [testUtils()] });
const context = await auth.$context;
const cookies = await context.test.getCookies({ userId: 'test-admin' });
// A previously valid session for a now unauthorized account exercises the runtime guard.
const previousAuth = betterAuth({
  ...authOptions,
  databaseHooks: undefined,
  plugins: [testUtils()]
});
const previousContext = await previousAuth.$context;
const outsider = await previousContext.test.getCookies({ userId: 'test-outsider' });
await mkdir('/artifacts/auth', { recursive: true });
await writeFile('/artifacts/auth/admin.json', JSON.stringify({ cookies, origins: [] }), {
  mode: 0o600
});
for (const project of ['chromium', 'firefox', 'webkit', 'android', 'iphone']) {
  const logoutCookies = await context.test.getCookies({ userId: 'test-admin' });
  await writeFile(
    `/artifacts/auth/logout-${project}.json`,
    JSON.stringify({ cookies: logoutCookies, origins: [] }),
    { mode: 0o600 }
  );
}
await writeFile(
  '/artifacts/auth/outsider.json',
  JSON.stringify({ cookies: outsider, origins: [] }),
  { mode: 0o600 }
);
await pool.end();
console.log('Sessões de teste geradas no volume isolado.');
