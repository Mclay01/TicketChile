import 'server-only';
import {randomUUID} from 'node:crypto';
import type Stripe from 'stripe';
import {pool,withTx} from '@/lib/db';
import {stripe} from '@/lib/stripe.server';
import {lockInventory} from './inventory.server';
import {audit} from '@/lib/security/audit.server';
import {operation,requireAdminCapability,fail,text,type OperationInput} from '@/lib/admin/policy.server';
import type {Principal} from '@/lib/security/identity.server';
type Refund={id:string;payment_id:string;order_id:string;amount_clp:number;status:string;provider_ref:string|null;first_attempt_at:Date|null;lease_until:Date|null;provider:string;provider_intent:string|null;currency:string};
const select=`SELECT r.*,p.provider,p.provider_intent,p.currency FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE r.id::text=$1`;
export function refundProviderStatus(){return {provider:'stripe',enabled:process.env.STRIPE_REFUNDS_ENABLED==='true'&&/^sk_(test|live)_/.test(process.env.STRIPE_SECRET_KEY||''),mode:'FULL_ORDER_ONLY',otherProviders:'MANUAL_REVIEW'};}
export async function refundOperation(input:OperationInput,actor?:Principal){
 if(input.action==='refund.execute')return executeRefund(input,actor);
 return operation(input,'refund.write',async(db,p,id)=>{
  if(input.action==='refund.request'){
   const payment=(await db.query("SELECT * FROM payments WHERE id=$1 FOR UPDATE",[input.target])).rows[0];
   if(!payment||payment.status!=='PAID'||!payment.verified_at||!payment.order_id||payment.fulfillment_status!=='ISSUED')fail('Se requiere un pago verificado con una orden emitida.');
   const tickets=await db.query('SELECT id,status FROM tickets WHERE order_id=$1',[payment.order_id]);
   if(!tickets.rowCount||tickets.rows.some(t=>t.status==='USED'))fail('Las entradas usadas requieren revisión manual.');
   const bound=await db.query(`SELECT 1 FROM orders o WHERE o.id=$1 AND o.hold_id=$2 AND o.event_id=$3 AND lower(o.owner_email)=lower($4)
    AND NOT EXISTS(SELECT 1 FROM tickets t WHERE t.order_id=o.id AND t.event_id<>o.event_id)`,[payment.order_id,payment.hold_id,payment.event_id,payment.owner_email]);
   if(!bound.rowCount)fail('La orden no corresponde al pago verificado.');
   if((await db.query("SELECT 1 FROM refunds WHERE payment_id=$1 AND status NOT IN ('FAILED','REJECTED')",[payment.id])).rowCount)fail('Ya existe una solicitud activa.');
   if((await db.query('SELECT 1 FROM settlement_claims WHERE payment_id=$1',[payment.id])).rowCount)fail('El pago pertenece a una liquidación. Cancela el borrador o realiza una revisión contable.');
   await db.query('INSERT INTO refunds(id,payment_id,order_id,amount_clp) VALUES($1,$2,$3,$4)',[id,payment.id,payment.order_id,payment.amount_clp]);
   await db.query('INSERT INTO refund_tickets(refund_id,ticket_id) SELECT $1,id FROM tickets WHERE order_id=$2',[id,payment.order_id]);
   return {value:{id},next:'REQUESTED'};
  }
  const r=(await db.query<Refund>(`${select} FOR UPDATE OF r`,[input.target])).rows[0];if(!r)fail('Solicitud no encontrada.');
  if(input.action==='refund.approve'){
   if(r.status!=='REQUESTED')fail('La solicitud no está pendiente.');
   await db.query("UPDATE refunds SET status='APPROVED',policy_reference=$2,updated_at=now() WHERE id=$1",[r.id,text(input.policyReference)]);
   return {value:{id:r.id},previous:r.status,next:'APPROVED'};
  }
  if(input.action==='refund.reject'&&['REQUESTED','APPROVED'].includes(r.status)){
   await db.query("UPDATE refunds SET status='REJECTED',updated_at=now() WHERE id=$1",[r.id]);return {value:{id:r.id},previous:r.status,next:'REJECTED'};
  }
  fail('Operación no permitida.');
 },actor);
}
async function executeRefund(input:OperationInput,actor?:Principal){
 const p=await requireAdminCapability('refund.write',actor);
 if(!refundProviderStatus().enabled)fail('Ejecución Stripe deshabilitada. La solicitud puede revisarse sin mover dinero.','PROVIDER_DISABLED');
 const claim=await operation(input,'refund.write',async(db)=>{
  const r=(await db.query<Refund>(`${select} FOR UPDATE OF r`,[input.target])).rows[0];if(!r)fail('Solicitud no encontrada.');
  if(r.status==='COMPLETED')return {value:r,next:'COMPLETED'};
  if(!['APPROVED','PROCESSING','UNKNOWN'].includes(r.status)||r.provider!=='stripe'||!r.provider_intent||r.currency.toUpperCase()!=='CLP')fail('Proveedor o solicitud no habilitados para ejecución.');
  if(!(await db.query("SELECT 1 FROM payments WHERE id=$1 AND order_id=$2 AND amount_clp=$3 AND status='PAID' AND verified_at IS NOT NULL AND fulfillment_status='ISSUED'",[r.payment_id,r.order_id,r.amount_clp])).rowCount)fail('El pago ya no coincide con la solicitud.');
  if(r.lease_until&&new Date(r.lease_until)>new Date())fail('Hay una conciliación en curso.');
  if(!r.provider_ref&&r.first_attempt_at&&Date.now()-new Date(r.first_attempt_at).getTime()>23*3600000)fail('Ventana de reintento agotada. Revisar en Stripe antes de cualquier nueva instrucción.','MANUAL_REVIEW');
  if((await db.query("SELECT 1 FROM tickets WHERE order_id=$1 AND status='USED'",[r.order_id])).rowCount)fail('Una entrada ya fue usada. Revisión manual requerida.');
  if((await db.query('SELECT 1 FROM settlement_claims WHERE payment_id=$1',[r.payment_id])).rowCount)fail('El pago pertenece a una liquidación.');
  await db.query("UPDATE refunds SET status='PROCESSING',first_attempt_at=COALESCE(first_attempt_at,now()),lease_until=now()+interval '2 minutes',updated_at=now() WHERE id=$1",[r.id]);
  return {value:r,previous:r.status,next:'PROCESSING'};
 },p);
 if(claim.replayed||!('result' in claim)||!claim.result||claim.result.status==='COMPLETED')return claim;
 const r=claim.result;
 try{
  // Same durable key and immutable parameters on every create retry. Never caller-supplied amounts.
  const evidence=r.provider_ref?await stripe.refunds.retrieve(r.provider_ref):await stripe.refunds.create({payment_intent:r.provider_intent!,amount:r.amount_clp,metadata:{refundId:r.id,paymentId:r.payment_id}},{idempotencyKey:`ticketchile-refund-${r.id}`});
  await applyStripeRefund(evidence,'API');
 }catch(error){
  await pool.query("UPDATE refunds SET status='UNKNOWN',lease_until=NULL,updated_at=now() WHERE id=$1 AND status='PROCESSING'",[r.id]);
  // A timeout/500 is not proof of failure; tickets remain blocked until reconciliation.
  if(error instanceof Error&&'code' in error&&error.code==='REFUND_BINDING')throw error;
  fail('Resultado pendiente de conciliación. No crees otra solicitud.','REFUND_UNKNOWN');
 }
 return claim;
}
/** Only authenticated Stripe API responses or signature-verified webhook objects enter here. */
export async function applyStripeRefund(evidence:Stripe.Refund,source:'API'|'WEBHOOK'){
 return withTx(async db=>{
  await lockInventory(db);
  const id=evidence.metadata?.refundId;if(!id)return {ignored:true};
  const r=(await db.query<Refund>(`${select} FOR UPDATE OF r`,[id])).rows[0];
  const intent=typeof evidence.payment_intent==='string'?evidence.payment_intent:evidence.payment_intent?.id;
  if(!r||r.provider!=='stripe'||!r.first_attempt_at||r.provider_intent!==intent||r.payment_id!==evidence.metadata?.paymentId||evidence.amount!==r.amount_clp||evidence.currency.toUpperCase()!==r.currency.toUpperCase()||(r.provider_ref&&r.provider_ref!==evidence.id))fail('La evidencia no corresponde a esta solicitud.','REFUND_BINDING');
  if(!['PROCESSING','UNKNOWN','COMPLETED','FAILED'].includes(r.status))fail('Estado incompatible.','REFUND_BINDING');
  const state=evidence.status==='succeeded'?'COMPLETED':['failed','canceled'].includes(evidence.status||'')?'FAILED':'PROCESSING';
  await db.query('INSERT INTO refund_evidence(id,refund_id,provider_ref,status,amount_clp,source) VALUES($1,$2,$3,$4,$5,$6) ON CONFLICT DO NOTHING',[randomUUID(),r.id,evidence.id,evidence.status||'pending',evidence.amount,source]);
  // Terminal success is monotonic, including out-of-order callbacks.
  if(r.status==='COMPLETED')return {id:r.id,status:r.status};
  if(r.status==='FAILED'&&state!=='COMPLETED')return {id:r.id,status:r.status};
  await db.query('UPDATE refunds SET status=$2,provider_ref=$3,lease_until=NULL,updated_at=now() WHERE id=$1',[r.id,state,evidence.id]);
  if(state==='COMPLETED')await db.query("UPDATE tickets t SET status='CANCELLED' WHERE t.order_id=$1 AND t.status='VALID' AND EXISTS(SELECT 1 FROM refund_tickets rt WHERE rt.refund_id=$2 AND rt.ticket_id=t.id)",[r.order_id,r.id]);
  await audit(db,{actor:{kind:'SYSTEM',id:'stripe-refund'},action:'refund.evidence',targetType:'refund',targetId:r.id,metadata:{outcome:state,provider:'stripe'}});
  return {id:r.id,status:state};
 });
}
