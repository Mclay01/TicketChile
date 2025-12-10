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
  // Flow puede mandar los datos como form-urlencoded (body)
  // o (rara vez) como querystring, así que miramos ambos.
  const token =
    (req.body?.token as string | undefined) ||
    (req.query?.token as string | undefined) ||
    undefined;

  console.log('[Flow] Webhook recibido. body =', req.body, 'query =', req.query);

  if (!token) {
    console.warn('[Flow] Webhook sin token. No se puede consultar el pago.');
    return res.status(400).send('Missing token');
  }

  try {
    // 1) Preguntamos a Flow el estado del pago
    const payment = await paymentsService.getPaymentStatus(token);
    console.log('[Flow] Estado del pago:', payment);

    // Flow:
    // 0 = pendiente, 1 = rechazado, 2 = pagado, 3 = anulado
    if (payment.status === 2) {
      console.log('[Flow] Pago pagado. Procesando creación de orden...');

      let meta: any = null;
      if (payment.optional) {
        try {
          meta = JSON.parse(payment.optional);
        } catch (e) {
          console.error(
            '[Flow] No se pudo parsear payment.optional:',
            payment.optional
          );
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
          // Compra con usuario logueado
          console.log(
            '[Flow] Creando orden privada para userId:',
            buyerUserId
          );

          await ordersService.createOrder(buyerUserId, {
            eventId,
            items: [
              {
                ticketTypeId,
                quantity,
              },
            ],
          });
        } else {
          // Compra pública (sin login)
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
              items: [
                {
                  ticketTypeId,
                  quantity,
                },
              ],
            });
          }
        }
      }
    } else {
      console.log('[Flow] Pago no pagado. status =', payment.status);
    }

    // Flow sólo necesita 200 para dar por recibido el webhook
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[Flow] Error procesando webhook:', err);
    return res.status(500).send('Internal error');
  }
}

