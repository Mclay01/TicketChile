import 'server-only';
import { pool } from '@/lib/db';
import { organizerActor } from '@/lib/security/capabilities.server';
import { readEvent } from './events.server';
import { AccessError } from '@/lib/access.server';
import { localProposal } from './proposals';
import { limit } from '@/lib/security/rate-limit.server';
export async function attendees(id:string,query='',status='',page=1){
  const actor=await organizerActor();await readEvent(id,'attendees.read',undefined,actor);
  const q=`%${query.slice(0,120).replace(/[\\%_]/g,'\\$&')}%`;
  const values=[id,actor.kind,actor.id,actor.version,q,['VALID','USED','CANCELLED'].includes(status)?status:''];
  const where=`t.event_id=$1 AND security_can_event($2,$3,$4,t.event_id,'attendees.read')
    AND ($6='' OR t.status=$6) AND (t.id ILIKE $5 OR t.owner_email ILIKE $5 OR o.buyer_name ILIKE $5 OR o.buyer_email ILIKE $5)`;
  const [rows,count]=await Promise.all([
    pool.query(`SELECT t.id,t.order_id,t.ticket_type_name,t.status,t.used_at,t.owner_email,o.buyer_name,o.buyer_email
      FROM tickets t JOIN orders o ON o.id=t.order_id WHERE ${where} ORDER BY t.created_at DESC,t.id LIMIT 50 OFFSET $7`,[...values,(Math.max(1,Math.min(10000,Math.floor(page)||1))-1)*50]),
    pool.query(`SELECT count(*)::int AS total FROM tickets t JOIN orders o ON o.id=t.order_id WHERE ${where}`,values)]);
  return {rows:rows.rows as {id:string;order_id:string;ticket_type_name:string;status:string;used_at:Date|null;owner_email:string;buyer_name:string;buyer_email:string}[],total:count.rows[0].total as number};
}
export async function sales(id:string){
  const actor=await organizerActor();await readEvent(id,'finance.read',undefined,actor);
  const args=[id,actor.kind,actor.id,actor.version],scope="event_id=$1 AND security_can_event($2,$3,$4,event_id,'finance.read')";
  const [summary,payments,timeline,tiers]=await Promise.all([
    pool.query(`SELECT count(DISTINCT order_id)::int AS orders,COALESCE(sum(amount_clp) FILTER(WHERE status='PAID' AND verified_at IS NOT NULL),0)::text AS gross,
      count(*) FILTER(WHERE fulfillment_status='REVIEW')::int AS review FROM payments WHERE ${scope}`,args),
    pool.query(`SELECT provider,status,count(*)::int AS count FROM payments WHERE ${scope} GROUP BY provider,status ORDER BY provider,status`,args),
    pool.query(`SELECT (paid_at AT TIME ZONE 'America/Santiago')::date::text AS day,sum(amount_clp)::text AS gross FROM payments
      WHERE ${scope} AND status='PAID' AND verified_at IS NOT NULL GROUP BY 1 ORDER BY 1 DESC LIMIT 60`,args),
    pool.query(`SELECT hi.ticket_type_name,sum(hi.qty)::int AS qty,sum(hi.qty*hi.unit_price_clp)::text AS gross FROM hold_items hi JOIN payments p ON p.hold_id=hi.hold_id
      WHERE p.event_id=$1 AND security_can_event($2,$3,$4,p.event_id,'finance.read') AND p.status='PAID' AND p.fulfillment_status='ISSUED' AND p.verified_at IS NOT NULL GROUP BY hi.ticket_type_name ORDER BY qty DESC`,args)]);
  return {summary:summary.rows[0] as {orders:number;gross:string;review:number},payments:payments.rows as {provider:string;status:string;count:number}[],timeline:timeline.rows as {day:string;gross:string}[],tiers:tiers.rows as {ticket_type_name:string;qty:number;gross:string}[]};
}
export async function staffForEvent(id:string){
  const e=await readEvent(id,'staff.manage');
  const [staff,invites]=await Promise.all([
    pool.query(`SELECT s.id,u.email,s.role,s.capabilities,s.event_ids FROM organizer_staff s JOIN usuarios u ON u.id=s.buyer_id
      WHERE s.organizer_id=$1 AND s.revoked_at IS NULL AND (s.event_ids IS NULL OR $2=ANY(s.event_ids)) ORDER BY u.email`,[e.organizer_id,id]),
    pool.query(`SELECT id,email,role,capabilities,event_ids,expires_at FROM organizer_invites WHERE organizer_id=$1 AND revoked_at IS NULL AND accepted_at IS NULL AND expires_at>now()
      AND (event_ids IS NULL OR $2=ANY(event_ids)) ORDER BY email`,[e.organizer_id,id])]);
  return JSON.parse(JSON.stringify({staff:staff.rows,invites:invites.rows})) as {staff:StaffEntry[];invites:StaffEntry[]};
}
export type StaffEntry={id:string;email:string;role:string;capabilities:string[];event_ids:string[]|null;expires_at?:string};
export async function accessMetrics(id:string){
  const p=await organizerActor();await readEvent(id,'scanner.read',undefined,p);
  return (await pool.query(`SELECT count(*)::int AS issued,count(*) FILTER(WHERE status='USED')::int AS checked,
    count(*) FILTER(WHERE status='CANCELLED')::int AS cancelled FROM tickets WHERE event_id=$1 AND security_can_event($2,$3,$4,event_id,'scanner.read')`,[id,p.kind,p.id,p.version])).rows[0] as {issued:number;checked:number;cancelled:number};
}
export async function activity(id:string){
  const p=await organizerActor();await readEvent(id,'audit.read',undefined,p);
  return (await pool.query(`SELECT action,created_at FROM security_audit WHERE event_id=$1 AND security_can_event($2,$3,$4,event_id,'audit.read') ORDER BY created_at DESC LIMIT 20`,[id,p.kind,p.id,p.version])).rows as {action:string;created_at:Date}[];
}
export async function organizerProposal(id:string,prompt:unknown){
  const actor=await organizerActor();
  await limit('organizer-proposal',`${actor.kind}:${actor.id}`,{hits:30,seconds:3600});
  const e=await readEvent(id,'event.edit');
  if(typeof prompt!=='string'||prompt.length<10||prompt.length>4000)throw new AccessError(400,'INVALID_INPUT','Describe el evento en 10 a 4000 caracteres.');
  if(process.env.NODE_ENV!=='production'&&process.env.ORGANIZER_AI_ADAPTER==='local')return localProposal(prompt,e.revision);
  // M7 owns the model adapter. No fake generation, prompt persistence or external transmission.
  throw new AccessError(503,'AI_UNAVAILABLE','TicketChile AI aún no tiene un proveedor habilitado. Tu borrador está disponible en el editor manual.');
}
