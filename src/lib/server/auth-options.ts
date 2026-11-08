import type { BetterAuthOptions } from 'better-auth';
import { drizzleAdapter } from '@better-auth/drizzle-adapter';
import { eq } from 'drizzle-orm';
import { db } from './db';
import { user, session, account, verification } from './db/schema';

export function isAdminIdentity(
  person: { email?: unknown; emailVerified?: unknown } | null | undefined
) {
  const emails = (process.env.ADMIN_EMAILS ?? '')
    .split(',')
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean);
  return (
    typeof person?.email === 'string' &&
    person.emailVerified === true &&
    emails.includes(person.email.toLowerCase())
  );
}
export const googleConfigured = !!(
  process.env.GOOGLE_CLIENT_ID && process.env.GOOGLE_CLIENT_SECRET
);
if (!process.env.BETTER_AUTH_SECRET && process.env.NODE_ENV === 'production')
  throw new Error('Configure BETTER_AUTH_SECRET antes de iniciar.');
export const authOptions = {
  appName: 'Flor de Cacau',
  baseURL: process.env.BETTER_AUTH_URL ?? 'http://localhost:5173',
  secret: process.env.BETTER_AUTH_SECRET ?? 'development-only-change-this-secret-32-characters',
  database: drizzleAdapter(db, {
    provider: 'pg',
    schema: { user, session, account, verification }
  }),
  socialProviders: googleConfigured
    ? {
        google: {
          clientId: process.env.GOOGLE_CLIENT_ID!,
          clientSecret: process.env.GOOGLE_CLIENT_SECRET!,
          prompt: 'select_account' as const
        }
      }
    : {},
  user: {
    validateUserInfo: ({ user: person, source }) => {
      if (
        source.method !== 'oauth' ||
        source.oauth?.providerId !== 'google' ||
        !isAdminIdentity(person)
      )
        return {
          error: 'access_denied',
          errorDescription: 'Esta conta não possui acesso administrativo.'
        };
    }
  },
  databaseHooks: {
    session: {
      create: {
        before: async (value) => {
          const [person] = await db.select().from(user).where(eq(user.id, value.userId)).limit(1);
          if (!isAdminIdentity(person)) return false;
          return { data: value };
        }
      }
    }
  },
  advanced: { useSecureCookies: (process.env.BETTER_AUTH_URL ?? '').startsWith('https://') }
} satisfies BetterAuthOptions;
