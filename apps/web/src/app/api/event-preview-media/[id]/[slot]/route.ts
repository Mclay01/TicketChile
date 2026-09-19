import { pool } from '@/lib/db';
import { requireEventAccess } from '@/lib/event-access.server';
import { accessResponse,AccessError } from '@/lib/access.server';
import { mediaSource,MEDIA_FALLBACK } from '@/lib/media';
import { normalizeImage } from '@/lib/media-storage.server';
export async function GET(_req:Request,{params}:{params:Promise<{id:string;slot:string}>}){
 try{const {id,slot}=await params;const access=await requireEventAccess(id,'event.read');
  const fields:Record<string,string>={poster:'image',desktop:'hero_desktop',mobile:'hero_mobile'};
  if(!Object.hasOwn(fields,slot))throw new AccessError(404,'NOT_FOUND','Imagen no disponible.');
  const result=await pool.query<{image:string}>(`SELECT ${fields[slot]} AS image FROM events WHERE id=$1 AND security_can_event($2,$3,$4,id,'event.read')`,[id,access.actor.kind,access.actor.id,access.actor.version]);
  const value=result.rows[0]?.image;if(!value?.startsWith('data:')||mediaSource(value)===MEDIA_FALLBACK)throw new AccessError(404,'NOT_FOUND','Imagen no disponible.');
  const bytes=await normalizeImage(Buffer.from(value.slice(value.indexOf(',')+1),'base64'));
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return accessResponse(e);}
}
