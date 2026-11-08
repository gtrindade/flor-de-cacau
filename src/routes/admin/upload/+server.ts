import type { RequestHandler } from './$types';
import { json } from '@sveltejs/kit';
import { requireAdmin } from '#lib/server/guards';
import { uploadImage } from '#lib/server/uploads';
export const POST: RequestHandler = async ({ locals, request }) => {
  const user = requireAdmin(locals, true);
  const data = await request.formData();
  const file = data.get('file');
  if (!(file instanceof File)) return json({ error: 'Selecione uma foto.' }, { status: 400 });
  try {
    return json(await uploadImage(file, user.id));
  } catch (cause) {
    return json(
      { error: cause instanceof Error ? cause.message : 'Falha ao enviar a foto.' },
      { status: 400 }
    );
  }
};
