import 'server-only';
import type Stripe from 'stripe';
import { stripe } from '@/lib/stripe.server';
import { flowCreatePayment, flowGetStatus } from '@/lib/flow';
import { WebpayPlus, Options, Environment } from 'transbank-sdk';
import { AccessError } from '@/lib/access.server';
import { paymentOrigin, type Provider } from './config.server';
import type { Payment, PaymentAdapter, VerifiedPayment } from './types';

function mismatch(): never { throw new AccessError(409,'PAYMENT_MISMATCH','No se pudo verificar el pago.'); }
export function normalizeStripe(p: Payment, session: Stripe.Checkout.Session, observationKey?: string): VerifiedPayment {
  if (session.id !== p.provider_ref || session.client_reference_id !== p.id || session.metadata?.paymentId !== p.id ||
      session.metadata?.holdId !== p.hold_id || session.mode !== 'payment' || session.amount_total !== Number(p.amount_clp) ||
      session.currency?.toUpperCase() !== p.currency || session.livemode !== process.env.STRIPE_SECRET_KEY?.startsWith('sk_live_')) mismatch();
  const intent = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
  if (session.payment_status === 'paid' && !intent) mismatch();
  if (p.provider_intent && intent !== p.provider_intent) mismatch();
  return { provider:'stripe',reference:session.id,paymentId:p.id,holdId:p.hold_id,amount:session.amount_total!,currency:p.currency,
    status: session.payment_status === 'paid' ? 'PAID' : session.status === 'expired' ? 'CANCELLED' : 'PENDING',
    observationKey:observationKey || `${session.id}:${session.payment_status}:${session.status}`,intent };
}
type WebpayResponse = { buy_order: string; session_id: string; amount: number; response_code?: number; status: string };
export function normalizeWebpay(p: Payment, response: WebpayResponse): VerifiedPayment {
  if (response.buy_order !== p.id || response.session_id !== p.hold_id || Number(response.amount) !== Number(p.amount_clp) || p.currency !== 'CLP') mismatch();
  const states: Record<string,VerifiedPayment['status']> = {INITIALIZED:'PENDING',AUTHORIZED:'PAID',FAILED:'FAILED',ABORTED:'CANCELLED'};
  const status = states[response.status];
  // Reversals/refunds need a reviewed lifecycle; never silently downgrade PAID.
  if (!status || (status === 'PAID' && response.response_code !== 0)) mismatch();
  return {provider:'webpay',reference:p.provider_ref!,paymentId:p.id,holdId:p.hold_id,amount:Number(response.amount),currency:'CLP',
    status,observationKey:`${p.provider_ref}:${status}`};
}
export function normalizeFlow(p: Payment, result: Awaited<ReturnType<typeof flowGetStatus>>): VerifiedPayment {
  if (result.commerceOrder !== p.id || Number(result.amount) !== Number(p.amount_clp) || result.currency?.toUpperCase() !== p.currency) mismatch();
  const states: Record<number,VerifiedPayment['status']> = {1:'PENDING',2:'PAID',3:'FAILED',4:'CANCELLED'};
  const status = states[result.status];
  if (!status || !Number.isSafeInteger(Number(result.flowOrder)) || Number(result.flowOrder) <= 0) mismatch();
  const intent = String(result.flowOrder);
  if (p.provider_intent && p.provider_intent !== intent) mismatch();
  return {provider:'flow',reference:p.provider_ref!,paymentId:p.id,holdId:p.hold_id,amount:Number(result.amount),currency:p.currency,
    status,observationKey:`${intent}:${status}`,intent};
}
function webpay() {
  if (!process.env.WEBPAY_COMMERCE_CODE || !process.env.WEBPAY_API_KEY || !['production','integration'].includes(process.env.WEBPAY_ENV || '')) throw new Error('Provider unavailable');
  return new WebpayPlus.Transaction(new Options(process.env.WEBPAY_COMMERCE_CODE,process.env.WEBPAY_API_KEY,
    process.env.WEBPAY_ENV === 'production' ? Environment.Production : Environment.Integration));
}
export function adapter(provider: Provider): PaymentAdapter {
  if (provider === 'stripe') return {
    provider,capabilities:{createRetry:'idempotent',refund:'provider-supported-unimplemented'},
    async create(p) {
      const base = paymentOrigin();
      const metadata = {paymentId:p.id,holdId:p.hold_id,eventId:p.event_id};
      const session = await stripe.checkout.sessions.create({mode:'payment',payment_method_types:['card'],
        client_reference_id:p.id,metadata,payment_intent_data:{metadata},customer_email:p.owner_email,
        line_items:[{quantity:1,price_data:{currency:'clp',unit_amount:p.amount_clp,product_data:{name:p.event_title}}}],
        success_url:`${base}/checkout/confirm?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url:`${base}/checkout/confirm?payment_id=${p.id}`,
        // The initial claim aligns the hold to this exact deadline. Both the
        // request and reservation deadline remain stable across retries.
        expires_at:Math.floor(new Date(p.creation_started_at!).getTime()/1000)+35*60,
      },{idempotencyKey:`payment-create:${p.id}`});
      if (!session.url || !session.id) throw new Error('Invalid provider response');
      return {reference:session.id,url:session.url};
    },
    async retrieve(p) { return normalizeStripe(p,await stripe.checkout.sessions.retrieve(p.provider_ref!)); },
  };
  if (provider === 'flow') return {
    provider,capabilities:{createRetry:'review',refund:'provider-supported-unimplemented'},
    async create(p) {
      const base = paymentOrigin();
      const result = await flowCreatePayment({commerceOrder:p.id,subject:p.event_title,amount:p.amount_clp,email:p.owner_email,
        currency:'CLP',urlReturn:`${base}/api/payments/flow/kick`,urlConfirmation:`${base}/api/payments/flow/confirm`,timeoutSeconds:480});
      return {reference:result.token,url:`${result.url}?token=${encodeURIComponent(result.token)}`};
    },
    async retrieve(p) { return normalizeFlow(p,await flowGetStatus(p.provider_ref!)); },
  };
  if (provider === 'webpay') return {
    provider,capabilities:{createRetry:'review',refund:'provider-supported-unimplemented'},
    async create(p) {
      const result = await webpay().create(p.id,p.hold_id,p.amount_clp,`${paymentOrigin()}/api/payments/webpay/return`);
      return {reference:result.token,url:result.url};
    },
    async retrieve(p,commit=false) {
      const tx = webpay();
      // A repeated or uncertain commit is recovered with authenticated status.
      let result;
      if (commit) { try { result = await tx.commit(p.provider_ref!); } catch { result = await tx.status(p.provider_ref!); } }
      else result = await tx.status(p.provider_ref!);
      return normalizeWebpay(p,result);
    },
  };
  throw new AccessError(503,'PROVIDER_UNAVAILABLE','Metodo de pago no disponible.');
}
