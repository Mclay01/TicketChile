import 'server-only';
import {pool,withTx} from '@/lib/db';
import {organizerActor} from '@/lib/security/capabilities.server';
import {readEvent} from '@/lib/organizer/events.server';
import {requireEventAccess} from '@/lib/event-access.server';
import {AccessError} from '@/lib/access.server';
import {audit} from '@/lib/security/audit.server';
import {limit} from '@/lib/security/rate-limit.server';
import {lockInventory} from '@/lib/payments/inventory.server';
export async function scannerEvents(){const p=await organizerActor();return (await pool.query(`SELECT e.id,e.title,e.city,e.venue,e.date_iso,e.lifecycle,
 COALESCE(a.enabled,true) AS enabled,a.starts_at FROM events e LEFT JOIN event_access_config a ON a.event_id=e.id
 WHERE security_can_event($1,$2,$3,e.id,'scanner.read') AND COALESCE(e.end_at,e.date_iso)>now()-interval '1 day'
 ORDER BY e.date_iso NULLS LAST,e.id LIMIT 200`,[p.kind,p.id,p.version])).rows;}
export async function accessConfig(id:string){await requireEventAccess(id);const row=(await pool.query('SELECT enabled,starts_at,gates FROM event_access_config WHERE event_id=$1',[id])).rows[0];return JSON.parse(JSON.stringify(row||{enabled:true,starts_at:null,gates:[]}));}
export async function saveAccess(id:string,b:Record<string,unknown>){
 const actor=await organizerActor();if(b.confirmed!==true||typeof b.enabled!=='boolean'||!Array.isArray(b.gates)||b.gates.length>12||b.gates.some(g=>typeof g!=='string'||!g.trim()||g.length>60)||b.startsAt!==null&&(typeof b.startsAt!=='string'||!Number.isFinite(Date.parse(b.startsAt))))throw new AccessError(400,'INVALID_INPUT','Revisa y confirma la configuración de acceso.');
 const gates=(b.gates as string[]).map(g=>g.trim());await limit('access-change',`${actor.kind}:${actor.id}`,{hits:60,seconds:3600});
 return withTx(async c=>{await lockInventory(c);const e=await readEvent(id,'event.edit',c,actor);await c.query('INSERT INTO event_access_config(event_id,enabled,starts_at,gates) VALUES($1,$2,$3,$4) ON CONFLICT(event_id) DO UPDATE SET enabled=$2,starts_at=$3,gates=$4,updated_at=now()',[id,b.enabled,b.startsAt,[...new Set(gates)]]);await audit(c,{actor,eventId:id,organizerId:e.organizer_id,action:'access.configured',targetType:'event',targetId:id});return {ok:true};});
}
export async function lookupTicket(eventId:string,ticketId:string){
 const access=await requireEventAccess(eventId);await limit('scanner-lookup',`${access.actor.kind}:${access.actor.id}`,{hits:120,seconds:60});
 if(!/^[a-zA-Z0-9_-]{1,200}$/.test(ticketId))throw new AccessError(400,'INVALID_INPUT','Código inválido.');
 const row=(await pool.query(`SELECT id,ticket_type_name,status,used_at FROM tickets WHERE id=$1 AND event_id=$2 AND security_can_event($3,$4,$5,event_id,'scanner.read')`,[ticketId,eventId,access.actor.kind,access.actor.id,access.actor.version])).rows[0];if(!row)throw new AccessError(404,'UNKNOWN_TICKET','Entrada no encontrada en este evento.');return JSON.parse(JSON.stringify(row));
}
