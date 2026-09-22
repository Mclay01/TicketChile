import 'server-only';
import {dateBound} from './date-filter';
import {pool} from '@/lib/db';
import {readEvent} from '@/lib/organizer/events.server';
import {organizerActor} from '@/lib/security/capabilities.server';
import {limit} from '@/lib/security/rate-limit.server';
import {AccessError} from '@/lib/access.server';
import {queueTicketResend} from '@/lib/mail/jobs.server';
import {audit} from '@/lib/security/audit.server';
import {TICKET_OWNER_SQL} from '@/lib/buyer-guard.server';
export type AttendeeFilters={q?:string;status?:string;tier?:string;from?:string;to?:string;page?:number;payment?:string;ticket?:string};
export async function attendeeList(id:string,f:AttendeeFilters={}){
 const actor=await organizerActor(),e=await readEvent(id,'attendees.read',undefined,actor);await limit('attendee-search',`${actor.kind}:${actor.id}`,{hits:120,seconds:60});
 const finance=e.capabilities.includes('finance.read');if(f.payment&&!finance)throw new AccessError(403,'NOT_AUTHORIZED','Se requiere permiso financiero para ese filtro.');
 const args:unknown[]=[id,actor.kind,actor.id,actor.version],where=["t.event_id=$1","security_can_event($2,$3,$4,t.event_id,'attendees.read')"];
 function add(sql:string,value:unknown){args.push(value);where.push(sql.replace('?',`$${args.length}`));}
 if(f.q)add(`(t.id ILIKE ? OR t.order_id ILIKE $${args.length+1} OR ${TICKET_OWNER_SQL} ILIKE $${args.length+1} OR o.buyer_name ILIKE $${args.length+1})`,`%${f.q.slice(0,120).replace(/[\\%_]/g,'\\$&')}%`);
 if(f.status){if(!['VALID','USED','CANCELLED'].includes(f.status))throw new AccessError(400,'INVALID_FILTER','Estado no implementado.');add('t.status=?',f.status);}
 if(f.tier)add('t.ticket_type_id=?',f.tier.slice(0,200));if(f.ticket)add('t.id=?',f.ticket.slice(0,200));
 if(f.payment){if(!['PAID','REVIEW','COURTESY'].includes(f.payment))throw new AccessError(400,'INVALID_FILTER','Estado inválido.');where.push(f.payment==='COURTESY'?'c.id IS NOT NULL':f.payment==='REVIEW'?"p.fulfillment_status='REVIEW'":"p.status='PAID'");}
 for(const [value,op] of [[f.from,'>='],[f.to,'<=']])if(value){add(`t.created_at${op}?`,dateBound(value,op==='<=').toISOString());}
 const page=Math.max(1,Math.min(10000,Math.floor(f.page||1))),joins='FROM tickets t JOIN orders o ON o.id=t.order_id LEFT JOIN payments p ON p.order_id=o.id LEFT JOIN complimentary_issues c ON c.order_id=o.id LEFT JOIN checkin_records cr ON cr.ticket_id=t.id';
 const rows=await pool.query(`SELECT t.id,t.order_id,t.ticket_type_id,t.ticket_type_name,t.status,t.created_at,t.used_at,${TICKET_OWNER_SQL} AS owner_email,
 o.buyer_name,o.buyer_email,(c.id IS NOT NULL) AS complimentary,cr.gate,cr.device,
 CASE WHEN security_can_event($2,$3,$4,t.event_id,'finance.read') THEN p.status END AS payment_status,
 CASE WHEN security_can_event($2,$3,$4,t.event_id,'finance.read') THEN p.amount_clp END AS amount_clp
 ${joins} WHERE ${where.join(' AND ')} ORDER BY t.created_at DESC,t.id LIMIT 51 OFFSET ${(page-1)*50}`,args);
 return {rows:JSON.parse(JSON.stringify(rows.rows.slice(0,50))),hasMore:rows.rows.length>50,page};
}
export async function resendAttendee(eventId:string,ticketId:unknown){
 const actor=await organizerActor(),e=await readEvent(eventId,'attendees.resend',undefined,actor);await limit('attendee-resend',`${actor.kind}:${actor.id}`,{hits:30,seconds:3600});
 if(typeof ticketId!=='string')throw new AccessError(400,'INVALID_INPUT','Ticket inválido.');
 const row=(await pool.query(`SELECT ${TICKET_OWNER_SQL} AS recipient FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.id=$1 AND t.event_id=$2 AND t.status='VALID' AND security_can_event($3,$4,$5,t.event_id,'attendees.resend')`,[ticketId,eventId,actor.kind,actor.id,actor.version])).rows[0];if(!row)throw new AccessError(404,'NOT_FOUND','Entrada no disponible.');
 const result=await queueTicketResend(ticketId,row.recipient);await audit(pool,{actor,eventId,organizerId:e.organizer_id,action:'attendee.resend_requested',targetType:'ticket',targetId:ticketId});return result;
}
