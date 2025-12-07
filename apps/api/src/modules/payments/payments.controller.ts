// apps/api/src/modules/payments/payments.controller.ts
import type { Request, Response, NextFunction } from 'express';
import * as paymentsService from './payments.service';

export async function createCheckoutSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const { amountCents, currency, successUrl, cancelUrl } = req.body as {
      amountCents: number;
      currency: string;
      successUrl: string;
      cancelUrl: string;
    };

    const checkoutUrl = await paymentsService.createCheckoutSession({
      amountCents,
      currency,
      successUrl,
      cancelUrl,
      metadata: {}, // si luego quieres mandar info extra, la agregamos aquí
    });

    res.json({ checkoutUrl });
  } catch (err) {
    console.error('Error creating checkout session:', err);
    next(err);
  }
}

// 🔔 Endpoint que llama Flow después del pago
export async function flowConfirmationHandler(
  req: Request,
  res: Response,
  _next: NextFunction
) {
  // Flow manda: token=XXXXXXXX en x-www-form-urlencoded
  const token = req.body?.token as string | undefined;

  console.log('[Flow] Confirmación recibida. token =', token);

  // Más adelante aquí podemos:
  // - Llamar a /payment/getStatus con ese token
  // - Ver si está pagado
  // - Crear la orden + tickets en la base de datos
  //
  // Por ahora solo respondemos 200 para que Flow quede feliz.
  res.status(200).send('OK');
}
