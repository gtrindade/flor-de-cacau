import { requireAdmin } from '#lib/server/guards';
import type { LayoutServerLoad } from './$types';
export const load: LayoutServerLoad = ({ locals }) => {
  const user = requireAdmin(locals);
  return { user: { name: user.name, email: user.email } };
};
