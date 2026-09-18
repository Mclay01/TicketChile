import 'server-only';
import { withTx } from '@/lib/db';
import { ownedPayment, PAYMENT_OWNER_SQL, type PaymentRow } from '@/lib/payment-access.server';
import { TICKET_OWNER_SQL } from '@/lib/buyer-guard.server';
import { AccessError } from '@/lib/access.server';
import { reconcilePayment } from '@/lib/payments/reconcile.server';
import type { Payment } from '@/lib/payments/types';
export async function buyerPaymentStatus(email: string,reference: Parameters<typeof ownedPayment>[1],reconcileStripe=false) {
 const owned=await ownedPayment(email,reference);
 // Check owner before provider I/O; scope visible data again afterwards.
 if((reconcileStripe && owned.provider==='stripe') || (owned.status==='PAID' && (owned as Payment).verified_at)) await reconcilePayment(owned as Payment);
 return withTx(async client=>{
  const p=(await client.query<PaymentRow & {fulfillment_status:string}>(
   `SELECT * FROM payments WHERE id=$1 AND ${PAYMENT_OWNER_SQL}=$2 FOR UPDATE`,[owned.id,email])).rows[0];
  if(!p) throw new AccessError(404,'NOT_FOUND','Pago no encontrado.');
  const tickets=p.order_id ? (await client.query(`SELECT t.id,t.order_id AS "orderId",t.event_id AS "eventId",
   t.ticket_type_name AS "ticketTypeName",t.status,t.created_at AS "createdAtISO"
   FROM tickets t JOIN orders o ON o.id=t.order_id WHERE o.id=$1 AND ${TICKET_OWNER_SQL}=$2 ORDER BY t.created_at`,[p.order_id,email])).rows : [];
  return {ok:true,payment:{id:p.id,holdId:p.hold_id,orderId:p.order_id||'',provider:p.provider,status:p.status,
   fulfillmentStatus:p.fulfillment_status,buyerName:p.buyer_name,buyerEmail:p.buyer_email,eventTitle:p.event_title,amountClp:p.amount_clp},tickets};
 });
}
