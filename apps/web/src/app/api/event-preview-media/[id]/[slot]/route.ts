import { pool } from '@/lib/db';
import { requireEventAccess } from '@/lib/event-access.server';
import { accessResponse,AccessError } from '@/lib/access.server';
import { mediaSource,MEDIA_FALLBACK } from '@/lib/media';
import { normalizeImage } from '@/lib/media-storage.server';
import { requireAdminCapability } from '@/lib/admin/policy.server';
export async function GET(_req:Request,{params}:{params:Promise<{id:string;slot:string}>}){
 try{const {id,slot}=await params;
  let actor,admin=false;
  try{actor=(await requireEventAccess(id,'event.read')).actor;}catch(error){
    if(!(error instanceof AccessError)||![401,403,404].includes(error.status))throw error;
    try{actor=await requireAdminCapability('operations.read');admin=true;}catch{throw error;}
  }
  const fields:Record<string,string>={poster:'image',desktop:'hero_desktop',mobile:'hero_mobile'};
  if(!Object.hasOwn(fields,slot))throw new AccessError(404,'NOT_FOUND','Imagen no disponible.');
  const result=await pool.query<{image:string}>(`SELECT ${fields[slot]} AS image FROM events WHERE id=$1 AND ${admin?"security_can_admin($2,$3,$4,'operations.read')":"security_can_event($2,$3,$4,id,'event.read')"}`,[id,actor.kind,actor.id,actor.version]);
  const value=result.rows[0]?.image;if(!value?.startsWith('data:')||mediaSource(value)===MEDIA_FALLBACK)throw new AccessError(404,'NOT_FOUND','Imagen no disponible.');
  const bytes=await normalizeImage(Buffer.from(value.slice(value.indexOf(',')+1),'base64'));
  return new Response(new Uint8Array(bytes),{headers:{'Content-Type':'image/webp','Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
 }catch(e){return accessResponse(e);}
}
