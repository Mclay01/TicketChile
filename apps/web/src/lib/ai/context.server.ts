import 'server-only';
import {pool} from '@/lib/db';
import {readEvent} from '@/lib/organizer/events.server';
import {checklist,type EventRecord} from '@/lib/organizer/model';
import type {Principal} from '@/lib/security/identity.server';
import type {Feature,Metric} from './model';

export const requiredCapability=(feature:Feature)=>feature==='analytics'?'finance.read':feature==='communication'?'attendees.read':'event.edit';
export async function aiContext(id:string,feature:Feature,actor:Principal){
 const event=await readEvent(id,requiredCapability(feature),undefined,actor);
 const facts:Metric[]=[];
 const context:Record<string,unknown>={};
 if(feature==='analytics'){
  const args=[id,actor.kind,actor.id,actor.version];
  const r=(await pool.query(`SELECT count(*) FILTER(WHERE status='PAID' AND verified_at IS NOT NULL)::int AS paid,
   COALESCE(sum(amount_clp) FILTER(WHERE status='PAID' AND verified_at IS NOT NULL),0)::text AS gross,
   count(*) FILTER(WHERE fulfillment_status='REVIEW')::int AS review FROM payments
   WHERE event_id=$1 AND security_can_event($2,$3,$4,event_id,'finance.read')`,args)).rows[0];
  const t=(await pool.query(`SELECT COALESCE(sum(sold),0)::int AS sold,COALESCE(sum(capacity),0)::int AS inventory
   FROM ticket_types WHERE event_id=$1 AND security_can_event($2,$3,$4,event_id,'finance.read')`,args)).rows[0];
  facts.push({key:'paid_orders',label:'Pagos verificados',value:r.paid,unit:'pagos'},{key:'gross_clp',label:'Bruto verificado',value:Number(r.gross),unit:'CLP'},{key:'review',label:'Pagos en revisión',value:r.review,unit:'pagos'},{key:'sold',label:'Entradas vendidas',value:t.sold,unit:'entradas'},{key:'inventory',label:'Capacidad asignada',value:t.inventory,unit:'entradas'});
  context.limitations=['Acumulado del evento, sin comparación temporal','Sin visitas, conversión, neto, impuestos ni pronósticos'];
 }else{
  const keys:Partial<Record<Feature,(keyof EventRecord)[]>>={title:['title','category_slug','city'],description:['title','description','date_iso','venue','city'],shorten:['description'],summary:['title','description'],seo:['title','description','city'],faq:['title','venue','city','date_iso','age_policy','access_info'],tiers:['title','capacity'],promotion:['title','category_slug','city'],communication:['title','date_iso','venue','city','access_info']};
  for(const key of keys[feature]||['title','description','category_slug','date_iso','end_at','city','venue','capacity'])context[key]=event[key];
  if(feature==='readiness')context.checklist=checklist(event);
  if(feature==='communication'){
   const row=(await pool.query(`SELECT count(*)::int AS issued,count(*) FILTER(WHERE status='USED')::int AS checked
    FROM tickets WHERE event_id=$1 AND security_can_event($2,$3,$4,event_id,'attendees.read')`,[id,actor.kind,actor.id,actor.version])).rows[0];
   context.audience={issued:row.issued,checked:row.checked};
  }
 }
 return {event,context,facts};
}
