// apps/api/src/modules/payments/payments.controller.ts
import type { Request, Response, NextFunction } from 'express';
import * as paymentsService from './payments.service';
import * as ordersService from '../orders/orders.service';

export async function createCheckoutSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction
) {
  try {
    const {
      amountCents,
      currency,
      successUrl,
      cancelUrl,
      metadata,
    } = req.body as {
      amountCents: number;
      currency: string;
      successUrl: string;
      cancelUrl: string;
      metadata?: Record<string, string>;
    };

    const checkoutUrl = await paymentsService.createCheckoutSession({
      amountCents,
      currency,
      successUrl,
      cancelUrl,
      metadata: metadata ?? {},
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
  const token = req.body?.token as string | undefined;
  const s = req.body?.s as string | undefined;

  console.log('[Flow] Confirmación recibida. body =', req.body);

  if (!token || !s) {
    console.warn('[Flow] Webhook sin token o firma');
    return res.status(400).send('Missing token or signature');
  }

  const isValid = paymentsService.verifyFlowSignature({ token }, s);
  if (!isValid) {
    console.warn('[Flow] Firma inválida en webhook', { token, s });
    return res.status(400).send('Invalid signature');
  }

  try {
    const payment = await paymentsService.getPaymentStatus(token);

    console.log('[Flow] Estado del pago:', payment);

    if (payment.status === 2) {
      console.log('[Flow] Pago pagado. Procesando creación de orden...');

      // 👇 Intentamos primero payment.optional y si no, lo que venga en el body
      let meta: any = null;
      const rawOptional =
        payment.optional ?? (req.body?.optional as string | undefined);

      if (rawOptional) {
        try {
          meta = JSON.parse(rawOptional);
        } catch (e) {
          console.error('[Flow] No se pudo parsear optional:', rawOptional);
        }
      }

      if (!meta) {
        console.warn(
          '[Flow] Pago sin metadata (optional). No se puede crear la orden.'
        );
      } else {
        const mode = meta.mode as 'PUBLIC' | 'PRIVATE' | undefined;
        const eventId = meta.eventId as string | undefined;
        const ticketTypeId = meta.ticketTypeId as string | undefined;
        const quantity = Number(meta.quantity ?? 1);
        const buyerEmail = meta.buyerEmail as string | undefined;
        const buyerName = (meta.buyerName as string | undefined) ?? '';
        const buyerUserId = meta.buyerUserId as string | undefined;

        if (!eventId || !ticketTypeId || !quantity || quantity <= 0) {
          console.error(
            '[Flow] Metadata incompleta. No se crea la orden.',
            meta
          );
        } else if (mode === 'PRIVATE' && buyerUserId) {
          console.log(
            '[Flow] Creando orden privada para userId:',
            buyerUserId
          );

          await ordersService.createOrder(buyerUserId, {
            eventId,
            items: [{ ticketTypeId, quantity }],
          });
        } else {
          if (!buyerEmail) {
            console.error(
              '[Flow] Falta buyerEmail en compra pública. Metadata:',
              meta
            );
          } else {
            console.log(
              '[Flow] Creando orden pública para email:',
              buyerEmail
            );

            await ordersService.publicCreateOrderService({
              eventId,
              buyerName,
              buyerEmail,
              items: [{ ticketTypeId, quantity }],
            });
          }
        }
      }
    } else {
      console.log('[Flow] Pago no pagado. status =', payment.status);
    }

    return res.status(200).send('OK');
  } catch (err) {
    console.error('[Flow] Error procesando webhook:', err);
    return res.status(500).send('Internal error');
  }
}
