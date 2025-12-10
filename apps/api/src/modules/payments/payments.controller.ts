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
  const body = req.body || {};
  const token = body.token as string | undefined;
  const s = body.s as string | undefined;

  console.log('[Flow] Confirmación recibida. body =', body);

  if (!token || !s) {
    console.warn('[Flow] Webhook sin token o firma. body =', body);
    // Para que Flow no re-intente eternamente, devolvemos 200 igualmente.
    return res.status(200).send('OK');
  }

  // 1) Validar firma con TODO el payload (no solo token)
  try {
    const isValid = paymentsService.verifyFlowSignature(body, s);
    if (!isValid) {
      console.warn('[Flow] Firma inválida en webhook (MVP: continuamos igual)', {
        body,
        s,
      });
      // En este MVP **no** cortamos el flujo; solo lo logueamos.
    }
  } catch (e) {
    console.error('[Flow] Error verificando firma de webhook:', e);
    // Igual seguimos; preferimos no perder pagos reales.
  }

  try {
    // 2) Preguntar a Flow el estado del pago
    const payment = await paymentsService.getPaymentStatus(token);

    console.log('[Flow] Estado del pago desde getPaymentStatus:', payment);

    // Flow suele usar status:
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

        console.log('[Flow] Metadata recibida en webhook:', meta);

        if (!eventId || !ticketTypeId || !quantity || quantity <= 0) {
          console.error(
            '[Flow] Metadata incompleta. No se crea la orden.',
            meta
          );
        } else if (mode === 'PRIVATE' && buyerUserId) {
          // Compra con usuario logueado
          console.log(
            '[Flow] Creando orden PRIVADA para userId:',
            buyerUserId
          );

          try {
            await ordersService.createOrder(buyerUserId, {
              eventId,
              items: [
                {
                  ticketTypeId,
                  quantity,
                },
              ],
            });
            console.log('[Flow] Orden privada creada OK');
          } catch (e) {
            console.error(
              '[Flow] Error creando orden privada desde webhook:',
              e
            );
          }
        } else {
          // Compra pública (sin login)
          if (!buyerEmail) {
            console.error(
              '[Flow] Falta buyerEmail en compra pública. Metadata:',
              meta
            );
          } else {
            console.log(
              '[Flow] Creando orden PÚBLICA para email:',
              buyerEmail
            );

            try {
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
              console.log('[Flow] Orden pública creada OK');
            } catch (e) {
              console.error(
                '[Flow] Error creando orden pública desde webhook:',
                e
              );
            }
          }
        }
      }
    } else {
      console.log('[Flow] Pago no pagado. status =', payment.status);
    }

    // Flow sólo necesita 200 para dar por recibido el webhook
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[Flow] Error procesando webhook (getPaymentStatus o lógica interna):', err);
    // Aun así devolvemos 200 para que Flow no reintente indefinidamente
    return res.status(200).send('OK');
  }
}
