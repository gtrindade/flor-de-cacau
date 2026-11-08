import type { RequestHandler } from './$types';
import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { error } from '@sveltejs/kit';
import { getAccessibleMedia } from '#lib/server/catalog';
import { isAdminIdentity } from '#lib/server/auth-options';
import { uploadDir } from '#lib/server/uploads';
export const GET: RequestHandler = async ({ params, locals }) => {
  const image = await getAccessibleMedia(params.id, isAdminIdentity(locals.user));
  if (!/^[a-f0-9-]+\.webp$/.test(image.storageKey)) error(404);
  try {
    return new Response(await readFile(path.join(uploadDir, image.storageKey)), {
      headers: { 'Content-Type': 'image/webp', 'Cache-Control': 'private, max-age=300' }
    });
  } catch {
    error(404, 'Imagem não encontrada.');
  }
};
