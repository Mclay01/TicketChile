import 'server-only';
import { pool } from '@/lib/db';
import { ownedPayment } from '@/lib/payment-access.server';
import { AccessError } from '@/lib/access.server';
import { reconcilePayment } from '@/lib/payments/reconcile.server';
import type { Payment } from '@/lib/payments/types';
export async function reconcileFlow(token: string,buyer?: {email:string;paymentId?:string}) {
 if(!token || token.length>512) throw new AccessError(400,'INVALID_INPUT','Token invalido.');
 const payment=buyer ? await ownedPayment(buyer.email,{id:buyer.paymentId,provider:'flow',token}) as Payment :
  (await pool.query<Payment>("SELECT * FROM payments WHERE provider='flow' AND provider_ref=$1",[token])).rows[0];
 if(!payment) throw new AccessError(404,'NOT_FOUND','Pago no encontrado.');
 const result=await reconcilePayment(payment);
 return {paymentId:payment.id,localStatus:result.status==='ISSUED'||result.status==='REVIEW'?'PAID':result.status,orderId:result.orderId};
}
