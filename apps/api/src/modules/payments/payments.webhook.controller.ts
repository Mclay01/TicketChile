// apps/api/src/modules/payments/payments.webhook.controller.ts
import type { Request, Response } from 'express';
import { handleStripeWebhook } from './payments.webhook';

export async function stripeWebhookHandler(req: Request, res: Response) {
  // En app.ts ya deberías tener:
  // app.use('/api/payments/webhook', express.raw({ type: 'application/json' }));
  // Por eso req.body es un Buffer.

  const signature = req.headers['stripe-signature'] as string | undefined;

  try {
    if (!signature) {
      console.warn(
        '[payments] Webhook de Stripe sin header "stripe-signature". Ignorando.'
      );
      return res.status(200).send();
    }

    await handleStripeWebhook(signature, req.body as Buffer);
    return res.status(200).send();
  } catch (err) {
    console.error('Stripe webhook error:', err);
    return res.status(400).send('Webhook Error');
  }
}
