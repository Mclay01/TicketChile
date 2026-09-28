import "server-only";
import { mkdir, readFile, writeFile, unlink } from "node:fs/promises";
import { createHash } from 'node:crypto';
import path from "node:path";
import sharp from "sharp";
import { AccessError } from "@/lib/access.server";
import { validMediaKey } from './media-keys';
import { mediaConfig } from '../../media-config.mjs';
import { s3MediaStore, type S3Config } from './media-s3.server';

export interface MediaStore {
  provider: 'local' | 's3'; namespace: string; identity: string;
  put(key: string, bytes: Buffer): Promise<void>; get(key: string): Promise<Buffer>;
  head(key: string): Promise<{ bytes: number; checksum: string; contentType: string } | null>;
  delete(key: string): Promise<void>; readUrl?(key: string, published: boolean): Promise<string>;
}
export const checksum = (bytes: Buffer | string) => createHash('sha256').update(bytes).digest('hex');
export function mediaSettings() {
  try { return mediaConfig(); } catch { throw new AccessError(503, 'MEDIA_UNAVAILABLE', 'La carga de imágenes no está disponible.'); }
}
export function mediaStore(): MediaStore {
  const config = mediaSettings();
  if (config.provider === 'local') return localMediaStore();
  if (config.provider === 's3') return s3MediaStore(config as S3Config);
  throw new AccessError(503, 'MEDIA_UNAVAILABLE', 'La carga de imágenes no está disponible.');
}
/** Immutable local development objects. No production filesystem fallback. */
export function localMediaStore(root = path.resolve(process.cwd(), ".local/media")): MediaStore {
  if (process.env.NODE_ENV === "production") throw new AccessError(503, "MEDIA_UNAVAILABLE", "La carga de imágenes no está disponible.");
  const target = (key: string) => {
    if (!validMediaKey(key) || key.includes('/') && !key.startsWith('local/v1/')) throw new AccessError(400, "INVALID_MEDIA", "Imagen inválida.");
    return path.join(root, key);
  };
  return {
    provider: 'local', namespace: 'local/v1', identity: 'local',
    async put(key, bytes) { const file = target(key); await mkdir(path.dirname(file), { recursive: true }); await writeFile(file, bytes, { flag: "wx" }); },
    async get(key) { return readFile(target(key)); },
    async head(key) { try { const bytes = await readFile(target(key)); return { bytes: bytes.length, checksum: checksum(bytes), contentType: 'image/webp' }; }
      catch (e) { if ((e as NodeJS.ErrnoException).code === 'ENOENT') return null; throw e; } },
    async delete(key) { try { await unlink(target(key)); } catch (e) { if ((e as NodeJS.ErrnoException).code !== 'ENOENT') throw e; } },
  };
}
const processing = globalThis as typeof globalThis & { mediaProcessing?: number };
async function processImage<T>(run: () => Promise<T>) {
  const active = processing.mediaProcessing || 0;
  if (active >= mediaSettings().processingConcurrency) throw new AccessError(429, 'MEDIA_BUSY', 'Estamos procesando otras imágenes. Reintenta en unos segundos.');
  processing.mediaProcessing = active + 1;
  try { return await run(); } finally { processing.mediaProcessing!--; }
}
export async function normalizeImage(bytes: Buffer, declaredMime?: string) {
  return processImage(() => normalize(bytes, declaredMime));
}
async function normalize(bytes: Buffer, declaredMime?: string) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new AccessError(413, "MEDIA_SIZE", "Usa una imagen de hasta 5 MB.");
  try {
    const input = sharp(bytes, { limitInputPixels: 24_000_000, animated: false, failOn: 'warning' });
    const meta = await input.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format || "") || (meta.pages || 1) > 1) throw new Error("format");
    if (declaredMime && declaredMime !== `image/${meta.format}`) throw new Error('mime');
    if (!meta.width || !meta.height || meta.width > 16000 || meta.height > 16000 || meta.width * meta.height > 24_000_000) throw new Error('dimensions');
    // Decode/re-encode, remove EXIF/GPS and active content, bound pixels and output size.
    const result = await input.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    if (result.length > 5 * 1024 * 1024) throw new Error("size");
    return result;
  } catch { throw new AccessError(400, "INVALID_MEDIA", "Usa una imagen PNG, JPEG o WebP válida."); }
}
export type ImageVariant = { name: 'hero' | 'card' | 'thumb'; bytes: Buffer; width: number; height: number; checksum: string };
export async function imageVariants(bytes: Buffer, declaredMime: string): Promise<ImageVariant[]> {
  return processImage(async () => {
  const normalized = await normalize(bytes, declaredMime), variants: ImageVariant[] = [];
  for (const [name, width] of [['hero', 2400], ['card', 960], ['thumb', 320]] as const) {
    const output = name === 'hero' ? normalized : await sharp(normalized).resize({ width, height: width, fit: 'inside', withoutEnlargement: true }).webp({ quality: 80 }).toBuffer();
    const meta = await sharp(output).metadata();
    variants.push({ name, bytes: output, width: meta.width!, height: meta.height!, checksum: checksum(output) });
  }
  return variants;
  });
}
export async function readImageBody(request: Request, maxBytes = 5 * 1024 * 1024) {
  if (!/^image\/(png|jpeg|webp)$/.test(request.headers.get("content-type") || "")) throw new AccessError(415, "MEDIA_TYPE", "Formato no permitido.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "INVALID_MEDIA", "Falta la imagen.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > maxBytes) { await reader.cancel(); throw new AccessError(413, "MEDIA_SIZE", "Usa una imagen de hasta 5 MB."); } chunks.push(value);
  } } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
