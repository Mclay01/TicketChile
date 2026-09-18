import "server-only";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import path from "node:path";
import sharp from "sharp";
import { AccessError } from "@/lib/access.server";

export interface MediaStore { put(key: string, bytes: Buffer): Promise<void>; get(key: string): Promise<Buffer> }
const validKey = (key: string) => /^[a-f0-9-]{36}\.webp$/.test(key);
/** Immutable objects. Production requires an explicitly implemented object-store adapter. */
export function localMediaStore(root = path.resolve(process.cwd(), ".local/media")): MediaStore {
  if (process.env.NODE_ENV === "production") throw new AccessError(503, "MEDIA_UNAVAILABLE", "La carga de imágenes no está disponible.");
  const target = (key: string) => {
    if (!validKey(key)) throw new AccessError(400, "INVALID_MEDIA", "Imagen inválida.");
    return path.join(root, key);
  };
  return {
    async put(key, bytes) { const file = target(key); await mkdir(root, { recursive: true }); await writeFile(file, bytes, { flag: "wx" }); },
    async get(key) { return readFile(target(key)); },
  };
}
export async function normalizeImage(bytes: Buffer) {
  if (!bytes.length || bytes.length > 5 * 1024 * 1024) throw new AccessError(413, "MEDIA_SIZE", "Usa una imagen de hasta 5 MB.");
  try {
    const input = sharp(bytes, { limitInputPixels: 24_000_000, animated: false });
    const meta = await input.metadata();
    if (!["jpeg", "png", "webp"].includes(meta.format || "") || (meta.pages || 1) > 1) throw new Error("format");
    // Decode/re-encode, remove EXIF/GPS and active content, bound pixels and output size.
    const result = await input.rotate().resize({ width: 2400, height: 2400, fit: "inside", withoutEnlargement: true }).webp({ quality: 82 }).toBuffer();
    if (result.length > 5 * 1024 * 1024) throw new Error("size");
    return result;
  } catch { throw new AccessError(400, "INVALID_MEDIA", "Usa una imagen PNG, JPEG o WebP válida."); }
}
export async function readImageBody(request: Request) {
  if (!/^image\/(png|jpeg|webp)$/.test(request.headers.get("content-type") || "")) throw new AccessError(415, "MEDIA_TYPE", "Formato no permitido.");
  const reader = request.body?.getReader();
  if (!reader) throw new AccessError(400, "INVALID_MEDIA", "Falta la imagen.");
  const chunks: Uint8Array[] = []; let size = 0;
  try { for (;;) { const { done, value } = await reader.read(); if (done) break; size += value.length;
    if (size > 5 * 1024 * 1024) { await reader.cancel(); throw new AccessError(413, "MEDIA_SIZE", "Usa una imagen de hasta 5 MB."); } chunks.push(value);
  } } finally { reader.releaseLock(); }
  return Buffer.concat(chunks);
}
