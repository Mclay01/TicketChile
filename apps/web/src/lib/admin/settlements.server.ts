import 'server-only';
import {operation,fail,text,integer,type OperationInput} from './policy.server';
import type {Principal} from '@/lib/security/identity.server';
export async function settlementOperation(input:OperationInput,actor?:Principal){
 return operation(input,'settlement.write',async(db,p,id)=>{
  if(input.action==='settlement.create'){
   const owner=(await db.query('SELECT organizer_id FROM organizer_events WHERE event_id=$1',[input.target])).rows[0];if(!owner)fail('Evento no encontrado.');
   // Missing legacy or unconfigured purchase snapshots block, never silently imply zero commission.
   const missing=await db.query(`SELECT 1 FROM payments p LEFT JOIN payment_finance_snapshots s ON s.payment_id=p.id WHERE p.event_id=$1 AND p.status='PAID' AND p.verified_at IS NOT NULL AND p.fulfillment_status='ISSUED' AND NOT EXISTS(SELECT 1 FROM settlement_claims c WHERE c.payment_id=p.id) AND (s.commission_id IS NULL OR s.organizer_id<>$2) LIMIT 1`,[input.target,owner.organizer_id]);
   if(missing.rowCount)fail('Hay pagos sin política de comisión histórica validada. Revisión contable requerida.','MISSING_POLICY');
   if((await db.query(`SELECT 1 FROM refunds r JOIN payments p ON p.id=r.payment_id WHERE p.event_id=$1 AND r.status IN ('REQUESTED','APPROVED','PROCESSING','UNKNOWN') LIMIT 1`,[input.target])).rowCount)fail('Resuelve las solicitudes de reembolso antes de liquidar.');
   const rows=(await db.query(`SELECT p.id,s.gross_clp,s.commission_clp,s.commission_id,
    COALESCE((SELECT sum(r.amount_clp)::int FROM refunds r WHERE r.payment_id=p.id AND r.status='COMPLETED'),0) AS refunds_clp
    FROM payments p JOIN payment_finance_snapshots s ON s.payment_id=p.id WHERE p.event_id=$1 AND p.status='PAID' AND p.verified_at IS NOT NULL AND p.fulfillment_status='ISSUED' AND NOT EXISTS(SELECT 1 FROM settlement_claims c WHERE c.payment_id=p.id) ORDER BY p.id LIMIT 1001`,[input.target])).rows;
   if(!rows.length||rows.length>1000)fail('Se requieren entre 1 y 1000 pagos pendientes. Eventos mayores requieren lotes contables.');
   const gross=rows.reduce((n,r)=>n+r.gross_clp,0),refunds=rows.reduce((n,r)=>n+r.refunds_clp,0),commission=rows.reduce((n,r)=>n+r.commission_clp,0);
   await db.query('INSERT INTO settlements(id,organizer_id,event_id,gross_clp,refunds_clp,commission_clp,net_clp) VALUES($1,$2,$3,$4,$5,$6,$7)',[id,owner.organizer_id,input.target,gross,refunds,commission,gross-refunds-commission]);
   for(const r of rows){await db.query('INSERT INTO settlement_lines(settlement_id,payment_id,gross_clp,refunds_clp,commission_clp,commission_id) VALUES($1,$2,$3,$4,$5,$6)',[id,r.id,r.gross_clp,r.refunds_clp,r.commission_clp,r.commission_id]);await db.query('INSERT INTO settlement_claims(payment_id,settlement_id) VALUES($1,$2)',[r.id,id]);}
   return {value:{id},next:'DRAFT'};
  }
  const s=(await db.query('SELECT * FROM settlements WHERE id::text=$1 FOR UPDATE',[input.target])).rows[0];if(!s)fail('Liquidación no encontrada.');
  if(input.action==='settlement.adjust'){
   if(s.status!=='DRAFT')fail('Solo se ajustan borradores.');
   const amount=integer(input.amount,-100000000,100000000);if(amount===0)fail('El ajuste debe tener un monto distinto de cero.');
   await db.query('INSERT INTO settlement_adjustments(id,settlement_id,amount_clp,reason,actor_id) VALUES($1,$2,$3,$4,$5)',[id,s.id,amount,text(input.reason),p.id]);
   await db.query('UPDATE settlements SET adjustments_clp=adjustments_clp+$2,net_clp=net_clp+$2,updated_at=now() WHERE id=$1',[s.id,amount]);return {value:{id:s.id},previous:s.status,next:s.status};
  }
  if(input.action==='settlement.cancel'&&s.status==='DRAFT'){
   await db.query("UPDATE settlements SET status='CANCELLED',updated_at=now() WHERE id=$1",[s.id]);await db.query('DELETE FROM settlement_claims WHERE settlement_id=$1',[s.id]);return {value:{id:s.id},previous:s.status,next:'CANCELLED'};
  }
  if(input.action==='settlement.approve'&&s.status==='DRAFT'){
   if(Number(s.net_clp)<=0)fail('El saldo debe ser positivo.');
   if(input.accountingReviewed!==true)fail('Confirma la revisión de impuestos, tarifas del procesador y ajustes.');
   await db.query("UPDATE settlements SET status='APPROVED',policy_reference=$2,updated_at=now() WHERE id=$1",[s.id,text(input.policyReference)]);return {value:{id:s.id},previous:s.status,next:'APPROVED'};
  }
  if(input.action==='settlement.paid'&&s.status==='APPROVED'){
   if(integer(input.amount,1,Number.MAX_SAFE_INTEGER)!==Number(s.net_clp))fail('El monto debe coincidir exactamente con el saldo aprobado.');
   await db.query('INSERT INTO payout_records(id,settlement_id,reference,amount_clp,actor_id) VALUES($1,$2,$3,$4,$5)',[id,s.id,text(input.reference,160),input.amount,p.id]);
   await db.query("UPDATE settlements SET status='PAID',updated_at=now() WHERE id=$1",[s.id]);return {value:{id:s.id},previous:s.status,next:'PAID'};
  }
  fail('Transición no permitida.');
 },actor);
}
