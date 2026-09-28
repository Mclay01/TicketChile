import 'server-only';
import { pool, withTx } from '@/lib/db';
import { lockInventory } from '@/lib/payments/inventory.server';
import { audit } from '@/lib/security/audit.server';
import { checksum, imageVariants, mediaStore, type MediaStore } from './media-storage.server';
import { persistMedia } from './media-lifecycle.server';
import { mediaSlots } from './media-keys';

/** Trusted internal worker. Dry run is the default and performs no writes or storage calls. */
export async function adoptLegacyMedia({ dryRun = true, limit = 10, cursor = '', store }: { dryRun?: boolean; limit?: number; cursor?: string; store?: MediaStore } = {}) {
  if (!Number.isInteger(limit) || limit < 1 || limit > 50) throw new Error('Invalid adoption batch');
  let after = ['', ''];
  if (cursor) {
    if (cursor.length > 1200) throw new Error('Invalid checkpoint');
    after = JSON.parse(Buffer.from(cursor, 'base64url').toString());
    if (!Array.isArray(after) || after.length !== 2 || !after.every(v => typeof v === 'string' && v.length <= 200)) throw new Error('Invalid checkpoint');
  }
  const rows = (await pool.query(`SELECT e.id,e.revision,oe.organizer_id,v.slot,v.value FROM events e
    JOIN organizer_events oe ON oe.event_id=e.id CROSS JOIN LATERAL
    (VALUES ('image',e.image),('hero_desktop',e.hero_desktop),('hero_mobile',e.hero_mobile)) v(slot,value)
    WHERE v.value LIKE 'data:%' AND (e.id,v.slot)>($1,$2) ORDER BY e.id,v.slot LIMIT $3`, [...after,limit])).rows;
  const results: { eventId: string; slot: string; checksum: string; outcome: string; mediaId?: string }[] = [];
  for (const row of rows) {
    const hash = checksum(row.value), actor = { kind:'SYSTEM' as const, id:'media-adoption' };
    const slot = row.slot as keyof typeof mediaSlots;
    let mediaId: string | undefined;
    try {
      // Refresh between slots of one event; our previous slot may have advanced revision.
      row.revision = (await pool.query('SELECT revision FROM events WHERE id=$1', [row.id])).rows[0].revision;
      const match = /^data:(image\/(?:png|jpeg|webp));base64,([A-Za-z0-9+/=]+)$/.exec(row.value);
      if (!match || row.value.length > 7_000_000) throw new Error('Invalid legacy image');
      const bytes = Buffer.from(match[2], 'base64');
      if (dryRun) { await imageVariants(bytes,match[1]); results.push({eventId:row.id,slot,checksum:hash,outcome:'WOULD_ADOPT'}); continue; }
      await pool.query(`INSERT INTO media_legacy_adoptions(event_id,slot,source_checksum,original_value) VALUES($1,$2,$3,$4)
        ON CONFLICT(event_id,slot,source_checksum) DO UPDATE SET attempts=media_legacy_adoptions.attempts+1,updated_at=now()`, [row.id,slot,hash,row.value]);
      const asset = await persistMedia({organizerId:row.organizer_id,eventId:row.id,purpose:mediaSlots[slot],actor,
        requestKey:checksum(`adopt:${row.id}:${slot}:${hash}`),bytes,mime:match[1]},store || mediaStore());
      mediaId = asset.id;
      // Verify actual bytes, not just provider metadata, before changing the legacy reference.
      const activeStore = store || mediaStore();
      const variants = (await pool.query('SELECT object_key,checksum,bytes FROM media_variants WHERE media_id=$1', [asset.id])).rows;
      for (const variant of variants) {
        const stored = await activeStore.get(variant.object_key);
        if (stored.length !== variant.bytes || checksum(stored) !== variant.checksum) throw new Error('Verification failed');
      }
      const outcome = await withTx(async db => {
        await lockInventory(db);
        const current = (await db.query(`SELECT revision,${slot} AS value FROM events WHERE id=$1 FOR UPDATE`, [row.id])).rows[0];
        await db.query('SELECT id FROM media_objects WHERE id=$1 FOR UPDATE', [asset.id]);
        const ready = (await db.query("SELECT 1 FROM media_objects WHERE id=$1 AND state='READY'", [asset.id])).rowCount;
        if (!ready) throw new Error('Asset is unavailable');
        // Another worker may already have applied this exact mapping.
        if (current.value !== asset.url && (current.revision !== row.revision || current.value !== row.value)) {
          await db.query("UPDATE media_legacy_adoptions SET state='CONFLICT',media_id=$4,last_error='REVISION_CONFLICT',updated_at=now() WHERE event_id=$1 AND slot=$2 AND source_checksum=$3", [row.id,slot,hash,asset.id]);
          return 'CONFLICT';
        }
        if(current.value === asset.url && (await db.query("SELECT 1 FROM media_legacy_adoptions WHERE event_id=$1 AND slot=$2 AND source_checksum=$3 AND state='APPLIED'",[row.id,slot,hash])).rowCount)return 'APPLIED';
        if (current.value !== asset.url) await db.query(`UPDATE events SET ${slot}=$2,revision=revision+1,updated_at=now() WHERE id=$1`, [row.id,asset.url]);
        await db.query("UPDATE media_legacy_adoptions SET state='APPLIED',media_id=$4,last_error=NULL,updated_at=now() WHERE event_id=$1 AND slot=$2 AND source_checksum=$3", [row.id,slot,hash,asset.id]);
        await db.query('UPDATE media_objects SET orphaned_at=NULL,touched_at=now() WHERE id=$1', [asset.id]);
        await audit(db,{actor,action:'media.legacy_adopted',targetType:'media',targetId:asset.id,organizerId:row.organizer_id,eventId:row.id,metadata:{fields:slot}});
        return 'APPLIED';
      });
      results.push({eventId:row.id,slot,checksum:hash,outcome,mediaId});
    } catch {
      if (!dryRun) await pool.query(`INSERT INTO media_legacy_adoptions(event_id,slot,source_checksum,original_value,state,last_error) VALUES($1,$2,$3,$4,'FAILED','ADOPTION_FAILED')
        ON CONFLICT(event_id,slot,source_checksum) DO UPDATE SET state=CASE WHEN media_legacy_adoptions.state='APPLIED' THEN 'APPLIED' ELSE 'FAILED' END,last_error='ADOPTION_FAILED',updated_at=now()`, [row.id,slot,hash,row.value]).catch(() => {});
      results.push({eventId:row.id,slot,checksum:hash,outcome:'FAILED',mediaId});
    }
  }
  const last = rows.at(-1);
  return {dryRun,results,nextCursor:last?Buffer.from(JSON.stringify([last.id,last.slot])).toString('base64url'):null};
}
