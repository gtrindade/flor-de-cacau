import { svelteKitHandler } from 'better-auth/svelte-kit';
import { building } from '$app/env';
import { auth } from '#lib/server/auth';
import type { Handle } from '@sveltejs/kit/hooks';

export const handle: Handle = async ({ event, resolve }) => {
  event.locals.user = null;
  event.locals.session = null;
  if (!building && event.request.headers.get('cookie')?.includes('better-auth')) {
    const result = await auth.api.getSession({ headers: event.request.headers });
    event.locals.user = result?.user ?? null;
    event.locals.session = result?.session ?? null;
  }
  const response = await svelteKitHandler({ event, resolve, auth, building });
  response.headers.set('X-Content-Type-Options', 'nosniff');
  response.headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  response.headers.set('X-Frame-Options', 'DENY');
  return response;
};
