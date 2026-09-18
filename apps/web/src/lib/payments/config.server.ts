import 'server-only';
import { AccessError } from '@/lib/access.server';

export const providers = ['stripe','webpay','flow','fintoc','transfer'] as const;
export type Provider = typeof providers[number];
export function paymentOrigin() {
  const url = new URL(process.env.APP_BASE_URL || 'invalid');
  if (url.username || url.password || url.pathname !== '/' || url.search || url.hash ||
      (url.protocol !== 'https:' && !(process.env.NODE_ENV !== 'production' && url.protocol === 'http:' && ['localhost','127.0.0.1'].includes(url.hostname)))) {
    throw new Error('Invalid payment origin');
  }
  return url.origin;
}
export function feePolicy() {
  // Zero fees must be an explicit operator decision, never a prototype default.
  if (process.env.CHECKOUT_FEE_POLICY !== 'none') throw new AccessError(503,'PRICING_UNAVAILABLE','Checkout no disponible.');
  return { mode: 'none' as const, feeClp: 0 };
}
export function availability(provider: Provider) {
  let configured = false;
  try { paymentOrigin(); feePolicy(); configured = true; } catch { /* fail closed */ }
  const has = (...keys: string[]) => keys.every(key => Boolean(process.env[key]?.trim()));
  if (provider === 'stripe') configured &&= process.env.STRIPE_ENABLED === 'true' && has('STRIPE_SECRET_KEY','STRIPE_WEBHOOK_SECRET') &&
    /^(sk_test_|sk_live_)/.test(process.env.STRIPE_SECRET_KEY || '');
  if (provider === 'webpay') configured &&= process.env.WEBPAY_ENABLED === 'true' && has('WEBPAY_COMMERCE_CODE','WEBPAY_API_KEY') &&
    ['integration','production'].includes(process.env.WEBPAY_ENV || '');
  if (provider === 'flow') configured &&= process.env.FLOW_ENABLED === 'true' && has('FLOW_API_KEY','FLOW_SECRET_KEY') &&
    ['https://www.flow.cl/api','https://sandbox.flow.cl/api'].includes(process.env.FLOW_BASE_URL || '');
  if (provider === 'fintoc') configured = false;
  // No reviewed manual approval workflow exists yet; do not solicit transfers.
  if (provider === 'transfer') configured = false;
  return { provider, available: configured, asynchronous: provider === 'transfer',
    reason: configured ? null : provider === 'transfer' ? 'MANUAL_REVIEW_WORKFLOW_PENDING' : provider === 'fintoc' ? 'INTEGRATION_INCOMPLETE' : 'NOT_CONFIGURED' };
}
export function requireAvailable(provider: Provider) {
  if (!availability(provider).available) throw new AccessError(503,'PROVIDER_UNAVAILABLE','Metodo de pago no disponible.');
}
