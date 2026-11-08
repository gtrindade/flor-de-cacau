import { mkdir, writeFile, unlink } from 'node:fs/promises';
import path from 'node:path';
import sharp from 'sharp';
import { randomUUID } from 'node:crypto';
import { db } from './db';
import { media } from './db/schema';
export const uploadDir = path.resolve(process.env.UPLOAD_DIR ?? '.local/uploads');
export async function uploadImage(file: File, ownerId: string) {
  if (!file.size || file.size > 15 * 1024 * 1024) throw new Error('Cada foto deve ter até 15 MB.');
  let buffer: Buffer = Buffer.from(await file.arrayBuffer());
  if (/heic|heif/i.test(file.type + file.name)) {
    const { default: convert } = await import('heic-convert');
    buffer = Buffer.from(await convert({ buffer, format: 'JPEG', quality: 0.9 }));
  }
  let result;
  try {
    result = await sharp(buffer, { limitInputPixels: 50_000_000 })
      .rotate()
      .resize({ width: 1800, height: 1800, fit: 'inside', withoutEnlargement: true })
      .webp({ quality: 82 })
      .toBuffer({ resolveWithObject: true });
  } catch {
    throw new Error(
      'Não conseguimos ler essa imagem. Use uma foto JPEG, PNG, WebP ou HEIC válida.'
    );
  }
  const id = randomUUID();
  const key = `${id}.webp`;
  await mkdir(uploadDir, { recursive: true });
  await writeFile(path.join(uploadDir, key), result.data);
  try {
    await db.insert(media).values({
      id,
      ownerId,
      storageKey: key,
      width: result.info.width,
      height: result.info.height,
      alt: file.name.replace(/\.[^.]+$/, '').slice(0, 180)
    });
  } catch (cause) {
    await unlink(path.join(uploadDir, key)).catch(() => {});
    throw cause;
  }
  return { id, url: `/media/${id}`, alt: file.name };
}
export async function removeFiles(keys: string[]) {
  for (const key of keys)
    if (/^[a-f0-9-]+\.webp$/.test(key)) await unlink(path.join(uploadDir, key)).catch(() => {});
}
