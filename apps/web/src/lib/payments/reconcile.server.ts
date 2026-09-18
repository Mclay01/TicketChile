import 'server-only';
import { pool, withTx } from '@/lib/db';
import { expireHoldsTx } from './inventory.server';
import { audit } from '@/lib/security/audit.server';
import { adapter } from './adapters.server';
import { recordVerifiedPayment, finalizePayment } from './finalize.server';
import type { Payment, VerifiedPayment } from './types';
export async function applyVerifiedPayment(evidence: VerifiedPayment) {
 const id=await recordVerifiedPayment(evidence);
 const payment=(await pool.query<Payment>('SELECT * FROM payments WHERE id=$1',[id])).rows[0];
 if(payment.status==='PAID' && payment.verified_at) {
  try {return await finalizePayment(id);} catch {
   await audit(pool,{actor:{kind:'SYSTEM',id:'payment-service'},action:'payment.finalization_failed',targetType:'payment',targetId:id,metadata:{outcome:'RETRY_REQUIRED'}});
   throw new Error('Finalization pending recovery');
  }
 }
 return {orderId:payment.order_id||'',status:payment.status};
}
export async function reconcilePayment(payment: Payment,commit=false) {
 if(payment.status==='PAID' && payment.verified_at) return finalizePayment(payment.id);
 if(!payment.provider_ref || !['stripe','flow','webpay'].includes(payment.provider)) return {orderId:payment.order_id||'',status:payment.fulfillment_status};
 return applyVerifiedPayment(await adapter(payment.provider).retrieve(payment,commit));
}
/** Internal worker, never exposed as an anonymous HTTP operation. */
export async function reconcilePendingPayments(limit=50) {
 await withTx(expireHoldsTx);
 const rows=await pool.query<Payment>(`SELECT * FROM payments WHERE
  (status='PAID' AND verified_at IS NOT NULL AND fulfillment_status='PENDING') OR
  (provider_ref IS NOT NULL AND status IN ('CREATED','PENDING') AND updated_at<NOW()-interval '1 minute')
  ORDER BY COALESCE(last_reconciled_at,updated_at) LIMIT $1`,[Math.min(Math.max(limit,1),100)]);
 let recovered=0,failed=0;
 for(const payment of rows.rows) {
  try {await reconcilePayment(payment);recovered++;}
  catch {failed++;await audit(pool,{actor:{kind:'SYSTEM',id:'reconciler'},action:'payment.reconciliation_failed',targetType:'payment',targetId:payment.id,metadata:{provider:payment.provider,outcome:'RETRY_REQUIRED'}});}
  finally {await pool.query('UPDATE payments SET last_reconciled_at=NOW() WHERE id=$1',[payment.id]);}
 }
 return {recovered,failed};
}
