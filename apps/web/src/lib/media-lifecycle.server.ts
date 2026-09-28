import 'server-only';
import { randomUUID } from 'node:crypto';
import type { PoolClient } from 'pg';
import { pool, withTx } from '@/lib/db';
import { AccessError } from '@/lib/access.server';
import { audit, type Actor } from '@/lib/security/audit.server';
import { lockInventory } from '@/lib/payments/inventory.server';
import { checksum, imageVariants, mediaSettings, mediaStore, type MediaStore } from './media-storage.server';
import type { MediaPurpose } from './media-keys';

export const mediaReferencedSql = `(EXISTS(SELECT 1 FROM events e WHERE e.image='/api/media/'||m.id OR e.hero_desktop='/api/media/'||m.id OR e.hero_mobile='/api/media/'||m.id)
 OR EXISTS(SELECT 1 FROM media_legacy_adoptions a WHERE a.media_id=m.id AND a.state IN ('PENDING','APPLIED')))`;
type Upload = { organizerId: string; eventId: string; purpose: MediaPurpose; actor: Actor & { version?: number }; requestKey: string; bytes: Buffer; mime: string };
async function checkUploadScope(db: PoolClient, input: Upload) {
  // SYSTEM is reserved for the internal adoption worker, never parsed from HTTP.
  const result = await db.query(`SELECT 1 FROM organizer_events oe JOIN events e ON e.id=oe.event_id
    WHERE oe.event_id=$1 AND oe.organizer_id=$2 AND ($3='SYSTEM' OR
    (e.lifecycle NOT IN ('ENDED','CANCELLED') AND security_can_event($3,$4,$5,e.id,'event.edit')))`,
  [input.eventId, input.organizerId, input.actor.kind, input.actor.id, input.actor.version || 0]);
  if (!result.rowCount) throw new AccessError(404, 'NOT_AUTHORIZED', 'Evento no disponible.');
}
/** Durable intent before object writes. Row locks serialize retry, finalization and cleanup. */
export async function persistMedia(input: Upload, store: MediaStore = mediaStore()) {
  if (!/^[A-Za-z0-9_-]{16,100}$/.test(input.requestKey)) throw new AccessError(400, 'INVALID_KEY', 'Reintenta la carga desde el editor.');
  const settings = mediaSettings();
  if (input.bytes.length > settings.maxBytes) throw new AccessError(413, 'MEDIA_SIZE', 'La imagen supera el límite permitido.');
  const fingerprint = checksum(`${input.eventId}:${input.purpose}:${input.mime}:${checksum(input.bytes)}`);
  const variants = await imageVariants(input.bytes, input.mime);
  const creator = `${input.actor.kind}:${input.actor.id}`;
  const id = await withTx(async db => {
    await lockInventory(db); await checkUploadScope(db, input);
    const previous = (await db.query('SELECT * FROM media_objects WHERE organizer_id=$1 AND created_by=$2 AND request_key=$3 FOR UPDATE', [input.organizerId, creator, input.requestKey])).rows[0];
    if (previous) {
      if (previous.fingerprint !== fingerprint || previous.store_identity !== store.identity || previous.provider !== store.provider) throw new AccessError(409, 'MEDIA_CONFLICT', 'Esta carga corresponde a otra imagen.');
      if (['DELETING', 'DELETED'].includes(previous.state)) throw new AccessError(409, 'MEDIA_EXPIRED', 'La carga expiró. Selecciona la imagen nuevamente.');
      return previous.id as string;
    }
    const count = await db.query(`SELECT count(*)::int AS n FROM media_objects m WHERE organizer_id=$1 AND state<>'DELETED' AND NOT ${mediaReferencedSql}`, [input.organizerId]);
    if (count.rows[0].n >= settings.maxPending) throw new AccessError(429, 'MEDIA_QUOTA', 'Hay demasiadas imágenes pendientes. Guarda tus cambios o inténtalo más tarde.');
    const id = randomUUID(), prefix = `${store.namespace}/${checksum(input.organizerId).slice(0,24)}/${checksum(input.eventId).slice(0,24)}/${input.purpose}/${id}`;
    const hero = variants[0];
    await db.query(`INSERT INTO media_objects(id,organizer_id,event_id,object_key,content_type,bytes,purpose,provider,store_identity,width,height,checksum,created_by,request_key,fingerprint,state)
      VALUES($1,$2,$3,$4,'image/webp',$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'UPLOADING')`,
    [id,input.organizerId,input.eventId,`${prefix}/hero.webp`,hero.bytes.length,input.purpose,store.provider,store.identity,hero.width,hero.height,hero.checksum,creator,input.requestKey,fingerprint]);
    for (const v of variants) await db.query('INSERT INTO media_variants(media_id,name,object_key,bytes,width,height,checksum) VALUES($1,$2,$3,$4,$5,$6,$7)', [id,v.name,`${prefix}/${v.name}.webp`,v.bytes.length,v.width,v.height,v.checksum]);
    return id;
  });
  try {
    await withTx(async db => {
      const row = (await db.query('SELECT * FROM media_objects WHERE id=$1 FOR UPDATE', [id])).rows[0];
      await checkUploadScope(db, input);
      if (row.state === 'READY') return;
      if (row.state !== 'UPLOADING') throw new AccessError(409, 'MEDIA_EXPIRED', 'Selecciona la imagen nuevamente.');
      const stored = (await db.query('SELECT * FROM media_variants WHERE media_id=$1 ORDER BY name', [id])).rows;
      for (const record of stored) {
        const v = variants.find(v => v.name === record.name)!;
        if (v.checksum !== record.checksum) throw new Error('Normalization changed; use a new request key');
        let head = await store.head(record.object_key);
        if (!head) {
          try { await store.put(record.object_key, v.bytes); }
          catch (error) { head = await store.head(record.object_key); if (!head) throw error; }
          head = await store.head(record.object_key);
        }
        if (!head || head.bytes !== record.bytes || head.checksum !== record.checksum || head.contentType !== 'image/webp') throw new Error('Media integrity check failed');
      }
      await checkUploadScope(db, input);
      await db.query("UPDATE media_objects SET state='READY',touched_at=now(),orphaned_at=now(),last_error=NULL WHERE id=$1", [id]);
      await audit(db, { actor: input.actor, action: 'media.created', targetType: 'media', targetId: id, organizerId: input.organizerId, eventId: input.eventId });
    });
  } catch (error) {
    // Even if this update fails, the committed intent still identifies every key.
    await pool.query("UPDATE media_objects SET attempts=attempts+1,last_error='UPLOAD_FAILED' WHERE id=$1 AND state='UPLOADING'", [id]).catch(() => {});
    throw error;
  }
  return { id, url: `/api/media/${id}` };
}

/** Internal worker. No HTTP entry point. Every network delete is adapter-bounded. */
export async function cleanupMedia({ limit = 25, store = mediaStore() }: { limit?: number; store?: MediaStore } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid cleanup batch');
  const grace = mediaSettings().graceHours;
  // Bounded observation of detached assets starts a fresh grace period.
  await pool.query(`UPDATE media_objects SET orphaned_at=now() WHERE id IN
    (SELECT m.id FROM media_objects m WHERE state<>'DELETED' AND orphaned_at IS NULL AND provider=$1 AND store_identity=$2
      AND NOT ${mediaReferencedSql} ORDER BY touched_at,id LIMIT $3 FOR UPDATE SKIP LOCKED)`, [store.provider,store.identity,limit]);
  const candidates = (await pool.query(`SELECT id FROM media_objects m WHERE provider=$1 AND store_identity=$2 AND state<>'DELETED'
    AND next_attempt_at<=now() AND orphaned_at<now()-($3||' hours')::interval AND NOT ${mediaReferencedSql}
    ORDER BY touched_at,id LIMIT $4`, [store.provider,store.identity,String(grace),limit])).rows;
  const results: { id: string; outcome: string }[] = [];
  for (const { id } of candidates) {
    try {
      // Commit a tombstone before deletion; failed storage/DB writes remain retryable.
      const claimed = await withTx(async db => {
        const row = (await db.query('SELECT id FROM media_objects WHERE id=$1 FOR UPDATE SKIP LOCKED', [id])).rows[0];
        if (!row) return false;
        const result = await db.query(`UPDATE media_objects m SET state='DELETING' WHERE id=$1 AND state<>'DELETED'
          AND orphaned_at<now()-($2||' hours')::interval AND NOT ${mediaReferencedSql} RETURNING id`, [id,String(grace)]);
        return !!result.rowCount;
      });
      if (!claimed) { results.push({id,outcome:'SKIPPED'}); continue; }
      await withTx(async db => {
        const m = (await db.query("SELECT * FROM media_objects WHERE id=$1 AND state='DELETING' FOR UPDATE", [id])).rows[0];
        if (!m) return;
        if ((await db.query(`SELECT 1 FROM media_objects m WHERE id=$1 AND ${mediaReferencedSql}`, [id])).rowCount) throw new Error('Referenced tombstone requires review');
        const keys = (await db.query('SELECT object_key FROM media_variants WHERE media_id=$1', [id])).rows;
        for (const key of new Set([m.object_key,...keys.map(k => k.object_key)])) await store.delete(key);
        await db.query("UPDATE media_objects SET state='DELETED',deleted_at=now(),last_error=NULL WHERE id=$1", [id]);
        await audit(db, { actor: {kind:'SYSTEM',id:'media-cleanup'}, action:'media.deleted',targetType:'media',targetId:id,organizerId:m.organizer_id,eventId:m.event_id });
      });
      results.push({id,outcome:'DELETED'});
    } catch {
      await pool.query("UPDATE media_objects SET attempts=attempts+1,last_error='CLEANUP_FAILED',touched_at=now(),next_attempt_at=now()+interval '10 minutes' WHERE id=$1", [id]).catch(() => {});
      results.push({id,outcome:'FAILED'});
    }
  }
  return results;
}
