import { error, redirect } from '@sveltejs/kit';
import { isAdminIdentity } from './auth-options';
export function requireAdmin(locals: App.Locals, api = false) {
  if (!locals.user) {
    if (api) error(401, 'Entre para continuar.');
    redirect(303, '/entrar');
  }
  if (!isAdminIdentity(locals.user)) error(403, 'Esta conta não possui acesso administrativo.');
  return locals.user;
}
