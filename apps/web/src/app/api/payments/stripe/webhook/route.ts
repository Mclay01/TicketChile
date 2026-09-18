import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe.server';
import { pool } from '@/lib/db';
import { AccessError, accessResponse, privateJson } from '@/lib/access.server';
import { normalizeStripe } from '@/lib/payments/adapters.server';
import { applyVerifiedPayment } from '@/lib/payments/reconcile.server';
import type { Payment } from '@/lib/payments/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req: Request) {
 try {
  if(!process.env.STRIPE_WEBHOOK_SECRET) throw new AccessError(503,'UNAVAILABLE','Proveedor no disponible.');
  let event: Stripe.Event;
  try {event=stripe.webhooks.constructEvent(await req.text(),req.headers.get('stripe-signature')||'',process.env.STRIPE_WEBHOOK_SECRET);}
  catch {throw new AccessError(400,'INVALID_SIGNATURE','Firma invalida.');}
  if(!['checkout.session.completed','checkout.session.async_payment_succeeded','checkout.session.async_payment_failed','checkout.session.expired'].includes(event.type)) return privateJson(200,{received:true});
  const session=event.data.object as Stripe.Checkout.Session;
  const payment=(await pool.query<Payment>("SELECT * FROM payments WHERE provider='stripe' AND provider_ref=$1",[session.id])).rows[0];
  // A callback racing create persistence must retry, never adopt metadata IDs.
  if(!payment) throw new AccessError(503,'RETRY_REQUIRED','Pago pendiente de conciliacion.');
  const evidence=normalizeStripe(payment,session,event.id);
  if(event.type==='checkout.session.async_payment_failed' && evidence.status!=='PAID') evidence.status='FAILED';
  await applyVerifiedPayment(evidence);
  return privateJson(200,{received:true});
 } catch(error) {return accessResponse(error);}
}
