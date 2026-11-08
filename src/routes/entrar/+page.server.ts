import { redirect } from '@sveltejs/kit';
import { googleConfigured, isAdminIdentity } from '#lib/server/auth-options';
import type { PageServerLoad } from './$types';
export const load: PageServerLoad = ({ locals, url }) => {
  if (isAdminIdentity(locals.user)) redirect(303, '/admin');
  return { googleConfigured, denied: url.searchParams.has('error') };
};
