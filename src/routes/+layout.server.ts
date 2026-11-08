import { getSettings } from '#lib/server/catalog';
import { isAdminIdentity } from '#lib/server/auth-options';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = async ({ locals }) => ({
  settings: await getSettings(),
  admin: isAdminIdentity(locals.user)
});
