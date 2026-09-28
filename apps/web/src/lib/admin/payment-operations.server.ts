import 'server-only';
import {randomUUID} from 'node:crypto';
import {operation,fail,type OperationInput} from './policy.server';
import {finalizePaymentTx} from '@/lib/payments/finalize.server';
import type {Principal} from '@/lib/security/identity.server';
export async function paymentOperation(input:OperationInput,actor?:Principal){
 return operation<Record<string,unknown>>(input,input.action==='order.resend'?'support.write':'refund.write',async(db,_p,id)=>{
  if(input.action==='order.resend'){
   const tickets=await db.query("SELECT id,owner_email FROM tickets WHERE order_id=$1 AND status='VALID' ORDER BY id LIMIT 101",[input.target]);
   if(!tickets.rowCount||tickets.rows.length>100)fail('La orden no tiene entradas válidas o excede el límite de soporte.');
   if((await db.query("SELECT 1 FROM mail_jobs m JOIN tickets t ON t.id=m.source_id WHERE t.order_id=$1 AND m.created_at>now()-interval '10 minutes'",[input.target])).rowCount)fail('Hay un envío reciente. Espera diez minutos.');
   for(const t of tickets.rows)await db.query("INSERT INTO mail_jobs(id,dedupe_key,purpose,source_id,recipient) VALUES($1,$2,'TICKET',$3,$4)",[randomUUID(),`admin-resend:${id}:${t.id}`,t.id,t.owner_email]);
   return {value:{queued:tickets.rowCount},next:'QUEUED'};
  }
  if(input.action==='payment.finalize')return {value:await finalizePaymentTx(db,input.target),next:'RETRIED'};
  if(input.action==='payment.review'){
   const r=await db.query("UPDATE payments SET fulfillment_status='REVIEW',updated_at=now() WHERE id=$1 AND order_id IS NULL RETURNING id",[input.target]);
   if(!r.rowCount)fail('Solo se marcan pagos sin emisión para revisión.');
   return {value:{id:input.target},next:'REVIEW'};
  }
  fail('Operación no disponible.');
 },actor);
}
