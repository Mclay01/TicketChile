import 'server-only';
import {pool} from '@/lib/db';
import {audit} from '@/lib/security/audit.server';
import {requireAdminCapability,fail,type AdminCapability} from './policy.server';
import type {Principal} from '@/lib/security/identity.server';
export const sections={overview:'Resumen',organizers:'Organizadores',events:'Eventos',orders:'Compradores y órdenes',payments:'Pagos',refunds:'Reembolsos',commissions:'Comisiones',settlements:'Liquidaciones',support:'Soporte',reports:'Reportes',audit:'Auditoría',settings:'Configuración'};
export type Section=keyof typeof sections;
export const sectionCapability=(s:Section):AdminCapability=>['payments','refunds','commissions','settlements'].includes(s)?'finance.read':s==='audit'?'audit.read':s==='reports'?'reports.read':'operations.read';
type Filters={q?:string;state?:string;event?:string;organizer?:string;from?:string;to?:string;page?:string;actor?:string};
export type AdminRow=Record<string,string|number|boolean|null>;
export async function adminList(section:Section,filters:Filters={},actor?:Principal){
 const p=await requireAdminCapability(sectionCapability(section),actor);
 const q=(filters.q||'').trim().slice(0,120),state=(filters.state||'').slice(0,40),event=(filters.event||'').slice(0,200),org=(filters.organizer||'').slice(0,200);
 for(const date of [filters.from,filters.to])if(date&&(!/^\d{4}-\d{2}-\d{2}$/.test(date)||!Number.isFinite(Date.parse(date))||new Date(date).toISOString().slice(0,10)!==date))fail('Fecha inválida.');
 const from=filters.from?new Date(filters.from):null,to=filters.to?new Date(`${filters.to}T23:59:59.999Z`):null;
 if((from&&!Number.isFinite(from.getTime()))||(to&&!Number.isFinite(to.getTime())))fail('Fecha inválida.');
 const offset=(Math.max(1,Math.min(1000,Math.floor(Number(filters.page))||1))-1)*50;
 const args:unknown[]=[q,state,event,org,from,to,offset,p.kind,p.id,p.version,sectionCapability(section)];
 const guard='security_can_admin($8,$9,$10,$11)',period='($5::timestamptz IS NULL OR x.created_at>=$5) AND ($6::timestamptz IS NULL OR x.created_at<=$6)';
 let sql='';
 if(section==='organizers')sql=`SELECT x.id,x.display_name AS name,x.review_state AS state,x.verified AS email_verified,x.is_active AS active,x.created_at FROM organizer_users x WHERE (x.id=$1 OR x.display_name ILIKE '%'||$1||'%') AND ($2='' OR x.review_state=$2) AND ($4='' OR x.id=$4)`;
 if(section==='events')sql=`SELECT x.id,x.title AS name,x.lifecycle AS state,x.city,x.category_slug,x.date_iso,x.revision,x.moderation_block,oe.organizer_id,x.created_at FROM events x JOIN organizer_events oe ON oe.event_id=x.id WHERE ($1='' OR x.id=$1 OR x.title ILIKE '%'||$1||'%' OR x.city ILIKE '%'||$1||'%') AND ($2='' OR x.lifecycle=$2) AND ($3='' OR x.id=$3) AND ($4='' OR oe.organizer_id=$4)`;
 if(section==='orders'){
  // Exact lookup avoids an unrestricted buyer directory or wildcard PII enumeration.
  if(!q)return {rows:[] as AdminRow[],hasMore:false};
  sql=`SELECT x.id,x.event_id,x.created_at,(SELECT count(*)::int FROM tickets t WHERE t.order_id=x.id) AS tickets FROM orders x WHERE (x.id=$1 OR lower(x.buyer_email)=lower($1) OR EXISTS(SELECT 1 FROM tickets t WHERE t.order_id=x.id AND t.id=$1)) AND ($3='' OR x.event_id=$3) AND ($4='' OR EXISTS(SELECT 1 FROM organizer_events oe WHERE oe.event_id=x.event_id AND oe.organizer_id=$4)) AND ($2='' OR $2='ALL')`;
 }
 if(section==='payments'||section==='reports')sql=`SELECT x.id,x.event_id,x.order_id,x.provider,x.status AS state,x.amount_clp,x.currency,x.fulfillment_status,x.verified_at,x.created_at FROM payments x WHERE ($1='' OR x.id=$1 OR x.order_id=$1) AND ($2='' OR x.status=$2 OR x.fulfillment_status=$2) AND ($3='' OR x.event_id=$3) AND ($4='' OR EXISTS(SELECT 1 FROM organizer_events oe WHERE oe.event_id=x.event_id AND oe.organizer_id=$4))`;
 if(section==='refunds')sql=`SELECT x.id,x.payment_id,x.order_id,x.amount_clp,x.status AS state,x.created_at FROM refunds x JOIN payments p ON p.id=x.payment_id WHERE ($1='' OR x.id::text=$1 OR x.payment_id=$1) AND ($2='' OR x.status=$2) AND ($3='' OR p.event_id=$3) AND ($4='' OR EXISTS(SELECT 1 FROM organizer_events oe WHERE oe.event_id=p.event_id AND oe.organizer_id=$4))`;
 if(section==='settlements')sql=`SELECT x.id,x.event_id,x.organizer_id,x.gross_clp,x.refunds_clp,x.commission_clp,x.adjustments_clp,x.net_clp,x.status AS state,x.created_at FROM settlements x WHERE ($1='' OR x.id::text=$1) AND ($2='' OR x.status=$2) AND ($3='' OR x.event_id=$3) AND ($4='' OR x.organizer_id=$4)`;
 if(section==='commissions')sql=`SELECT x.id,x.scope,x.organizer_id,x.event_id,x.basis_points,x.fixed_clp,x.effective_at,x.policy_reference,x.created_at FROM commission_versions x WHERE ($1='' OR x.id::text=$1) AND ($2='' OR x.scope=$2) AND ($3='' OR x.event_id=$3) AND ($4='' OR x.organizer_id=$4)`;
 if(section==='support')sql=`SELECT x.id,x.subject AS name,x.status AS state,x.order_id,x.organizer_id,x.event_id,x.created_at FROM support_cases x WHERE ($1='' OR x.id::text=$1 OR x.order_id=$1 OR x.subject ILIKE '%'||$1||'%') AND ($2='' OR x.status=$2) AND ($3='' OR x.event_id=$3) AND ($4='' OR x.organizer_id=$4)`;
 if(section==='audit')sql=`SELECT x.id,x.actor_kind,x.actor_id,x.action,x.target_type,x.target_id,x.organizer_id,x.event_id,x.created_at FROM security_audit x WHERE ($1='' OR x.target_id=$1 OR x.actor_id=$1 OR x.action ILIKE '%'||$1||'%') AND ($2='' OR x.action=$2) AND ($3='' OR x.event_id=$3) AND ($4='' OR x.organizer_id=$4)`;
 if(!sql)fail('Sección no disponible.');
 // All parameter positions have declared types even for unused optional filters.
 sql+=` AND ${guard} AND ${period} AND ($2::text IS NOT NULL AND $3::text IS NOT NULL AND $4::text IS NOT NULL) ORDER BY x.created_at DESC,x.id DESC LIMIT 51 OFFSET $7`;
 const rows=(await pool.query(sql,args)).rows;
 if(['orders','reports','audit'].includes(section))await audit(pool,{actor:p,action:`admin.${section}.read`,targetType:section,metadata:{outcome:'BOUNDED_LOOKUP'}});
 return {rows:JSON.parse(JSON.stringify(rows.slice(0,50))) as AdminRow[],hasMore:rows.length>50};
}
export async function adminOverview(actor?:Principal){
 const p=await requireAdminCapability('operations.read',actor);
 const result=await pool.query(`SELECT
 (SELECT count(*)::int FROM organizer_users WHERE review_state IN ('PENDING','NEEDS_INFORMATION')) AS organizers,
 (SELECT count(*)::int FROM events WHERE lifecycle='IN_REVIEW' OR moderation_block) AS events,
 (SELECT count(*)::int FROM support_cases WHERE status<>'RESOLVED') AS support,
 (SELECT count(*)::int FROM organizer_event_submissions WHERE status='IN_REVIEW') AS legacy_submissions,
 CASE WHEN security_can_admin($1,$2,$3,'finance.read') THEN (SELECT count(*)::int FROM payments WHERE fulfillment_status='REVIEW') END AS payments,
 CASE WHEN security_can_admin($1,$2,$3,'finance.read') THEN (SELECT count(*)::int FROM refunds WHERE status IN ('REQUESTED','APPROVED','UNKNOWN','PROCESSING')) END AS refunds,
 CASE WHEN security_can_admin($1,$2,$3,'finance.read') THEN (SELECT count(*)::int FROM settlements WHERE status IN ('DRAFT','APPROVED')) END AS settlements
 WHERE security_can_admin($1,$2,$3,'operations.read')`,[p.kind,p.id,p.version]);
 return result.rows[0] as Record<string,number|null>;
}
export async function adminDetail(section:Section,id:string,actor?:Principal){
 const p=await requireAdminCapability(sectionCapability(section),actor);
 const queries:Partial<Record<Section,string>>={
  organizers:`SELECT id,display_name,email,verified,approved,is_active,review_state,created_at FROM organizer_users WHERE id=$1`,
  events:`SELECT e.id,e.title,e.description,e.date_iso,e.end_at,e.city,e.venue,e.address,e.category_slug,e.lifecycle,e.revision,e.moderation_block,e.cancellation_followup,oe.organizer_id FROM events e JOIN organizer_events oe ON oe.event_id=e.id WHERE e.id=$1`,
  orders:`SELECT id,event_id,buyer_name,buyer_email,created_at FROM orders WHERE id=$1`,
  payments:`SELECT id,event_id,order_id,provider,provider_ref,provider_intent,amount_clp,currency,status,creation_state,fulfillment_status,verified_at,paid_at,created_at FROM payments WHERE id=$1`,
  refunds:`SELECT r.id,r.payment_id,r.order_id,r.amount_clp,r.status,r.policy_reference,r.provider_ref,r.first_attempt_at,r.created_at,p.provider FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.id::text=$1`,
  settlements:`SELECT id,event_id,organizer_id,status,gross_clp,refunds_clp,commission_clp,adjustments_clp,net_clp,policy_reference,created_at FROM settlements WHERE id::text=$1`,
  support:`SELECT id,subject,status,order_id,organizer_id,event_id,created_at FROM support_cases WHERE id::text=$1`,
 };
 const sql=queries[section];if(!sql)fail('Detalle no disponible.');
 const row=(await pool.query(`${sql} AND security_can_admin($2,$3,$4,$5)`,[id,p.kind,p.id,p.version,sectionCapability(section)])).rows[0];if(!row)fail('Registro no encontrado.','NOT_FOUND',404);
 const related:Record<string,AdminRow[]>={};
 if(section==='organizers'){
  related.events=(await adminList('events',{organizer:id},p)).rows;
  related.staff=(await pool.query('SELECT role,count(*)::int AS count FROM organizer_staff WHERE organizer_id=$1 AND revoked_at IS NULL GROUP BY role',[id])).rows;
 }
 if(section==='events')related.tiers=(await pool.query('SELECT id,name,price_clp,capacity,sold,held FROM ticket_types WHERE event_id=$1 ORDER BY id LIMIT 50',[id])).rows;
 if(section==='orders'){
  related.tickets=(await pool.query('SELECT id,ticket_type_name,status,used_at FROM tickets WHERE order_id=$1 ORDER BY id LIMIT 100',[id])).rows;
  related.delivery=(await pool.query('SELECT state,attempts,created_at,sent_at FROM mail_jobs WHERE source_id IN (SELECT id FROM tickets WHERE order_id=$1) AND purpose=\'TICKET\' ORDER BY created_at DESC LIMIT 20',[id])).rows;
 }
 if(section==='payments'){
  related.evidence=(await pool.query('SELECT provider,status,amount_clp,currency,observed_at FROM payment_evidence WHERE payment_id=$1 ORDER BY observed_at DESC LIMIT 50',[id])).rows;
  related.commission=(await pool.query('SELECT commission_id,gross_clp,commission_clp FROM payment_finance_snapshots WHERE payment_id=$1',[id])).rows;
 }
 if(section==='refunds')related.evidence=(await pool.query('SELECT provider_ref,status,amount_clp,source,created_at FROM refund_evidence WHERE refund_id::text=$1 ORDER BY created_at DESC LIMIT 50',[id])).rows;
 if(section==='settlements'){
  related.payments=(await pool.query('SELECT payment_id,gross_clp,refunds_clp,commission_clp,commission_id FROM settlement_lines WHERE settlement_id::text=$1 ORDER BY payment_id LIMIT 1000',[id])).rows;
  related.adjustments=(await pool.query('SELECT amount_clp,reason,actor_id,created_at FROM settlement_adjustments WHERE settlement_id::text=$1 ORDER BY created_at LIMIT 100',[id])).rows;
  related.payout=(await pool.query('SELECT reference,amount_clp,actor_id,created_at FROM payout_records WHERE settlement_id::text=$1',[id])).rows;
 }
 if(section==='support')related.notes=(await pool.query('SELECT body,actor_id,created_at FROM support_notes WHERE case_id::text=$1 ORDER BY created_at DESC LIMIT 100',[id])).rows;
 related.history=(await pool.query('SELECT action,reason,previous_state,new_state,actor_id,created_at FROM admin_operations WHERE target_id=$1 ORDER BY created_at DESC LIMIT 50',[id])).rows;
 await audit(pool,{actor:p,action:'admin.detail.read',targetType:section,targetId:id});
 return JSON.parse(JSON.stringify({row,related})) as {row:AdminRow;related:Record<string,AdminRow[]>};
}
