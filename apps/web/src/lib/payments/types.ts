import type { PaymentRow } from '@/lib/payment-access.server';
import type { Provider } from './config.server';
export type Payment = PaymentRow & {
  provider: Provider; verified_at: Date | null; provider_intent: string | null;
  creation_state: 'NEW'|'CREATING'|'READY'|'UNKNOWN'; checkout_url: string | null;
  request_hash: string; creation_started_at: Date | null; fee_clp: number;
  fulfillment_status: 'PENDING'|'ISSUED'|'REVIEW';
};
export type VerifiedPayment = {
  provider: Provider; reference: string; paymentId: string; holdId: string;
  amount: number; currency: string; status: 'PENDING'|'PAID'|'FAILED'|'CANCELLED';
  observationKey: string; intent?: string;
};
export type CreatedPayment = { reference: string; url: string };
export interface PaymentAdapter {
  provider: Provider;
  capabilities: { createRetry: 'idempotent'|'review'; refund: 'provider-supported-unimplemented'|'unavailable' };
  create(payment: Payment): Promise<CreatedPayment>;
  retrieve(payment: Payment, commit?: boolean): Promise<VerifiedPayment>;
}
