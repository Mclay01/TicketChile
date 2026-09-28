import 'server-only';
import { S3Client, PutObjectCommand, HeadObjectCommand, GetObjectCommand, DeleteObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { createHash } from 'node:crypto';
import type { MediaStore } from './media-storage.server';
import { validMediaKey } from './media-keys';

export type S3Config = { bucket: string; region: string; endpoint?: string; origin: string; namespace: string; accessKeyId: string; secretAccessKey: string };
/** Explicit credentials only: never use the SDK's ambient production credential chain. */
export function s3MediaStore(config: S3Config, client = new S3Client({ region: config.region, endpoint: config.endpoint,
  forcePathStyle: !!config.endpoint, credentials: { accessKeyId: config.accessKeyId, secretAccessKey: config.secretAccessKey },
  maxAttempts: 2, requestHandler: { connectionTimeout: 3000, requestTimeout: 10000 } })): MediaStore {
  const object = (key: string) => {
    if (!validMediaKey(key) || !key.startsWith(`${config.namespace}/`)) throw new Error('Invalid media key');
    return { Bucket: config.bucket, Key: key };
  };
  return {
    provider: 's3', namespace: config.namespace,
    identity: createHash('sha256').update(`${config.origin}/${config.bucket}/${config.namespace}`).digest('hex'),
    async put(key, bytes) { await client.send(new PutObjectCommand({ ...object(key), Body: bytes, ContentType: 'image/webp',
      CacheControl: 'private, no-store', IfNoneMatch: '*', ChecksumSHA256: createHash('sha256').update(bytes).digest('base64'),
      Metadata: { sha256: createHash('sha256').update(bytes).digest('hex') } })); },
    async head(key) {
      try { const r = await client.send(new HeadObjectCommand(object(key)));
        return { bytes: r.ContentLength || 0, checksum: r.Metadata?.sha256 || '', contentType: r.ContentType || '' };
      } catch (e) { if ((e as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode === 404) return null; throw e; }
    },
    async get(key) { const r = await client.send(new GetObjectCommand(object(key))); if (!r.Body) throw new Error('Missing object'); return Buffer.from(await r.Body.transformToByteArray()); },
    async delete(key) { await client.send(new DeleteObjectCommand(object(key))); },
    async readUrl(key, published) {
      const url = await getSignedUrl(client, new GetObjectCommand({ ...object(key), ResponseContentType: 'image/webp',
        ResponseCacheControl: published ? 'public, max-age=60' : 'private, no-store' }), { expiresIn: 60 });
      if (new URL(url).origin !== config.origin) throw new Error('Unexpected media delivery origin');
      return url;
    },
  };
}
