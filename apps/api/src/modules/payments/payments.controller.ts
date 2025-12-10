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

  console.log('[Flow] Webhook recibido. body =', body);

  // 👇 IMPORTANTÍSIMO: SIEMPRE respondemos 200 a Flow LO MÁS RÁPIDO POSIBLE
  res.status(200).send('OK');

  // Y ahora hacemos todo lo demás en segundo plano
  (async () => {
    try {
      if (!token || !s) {
        console.warn('[Flow] Webhook sin token o firma (async). body =', body);
        return;
      }

      // 1) Intentar validar firma, pero NO detenemos el flujo si falla
      try {
        const isValid = paymentsService.verifyFlowSignature(body, s);
        if (!isValid) {
          console.warn(
            '[Flow] Firma inválida en webhook (no se detiene, solo se loguea).',
            { body, s }
          );
        }
      } catch (e) {
        console.error('[Flow] Error verificando firma del webhook:', e);
      }

      // 2) Preguntar a Flow el estado del pago
      const payment = await paymentsService.getPaymentStatus(token);

      console.log('[Flow] Estado del pago (async):', payment);

      // 0 = pendiente, 1 = rechazado, 2 = pagado, 3 = anulado
      if (payment.status !== 2) {
        console.log('[Flow] Pago no pagado. status =', payment.status);
        return;
      }

      console.log('[Flow] Pago pagado. Procesando creación de orden (async)...');

      // 3) Leer metadata desde payment.optional
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
        return;
      }

      console.log('[Flow] Metadata recibida en webhook (async):', meta);

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
        return;
      }

      if (mode === 'PRIVATE' && buyerUserId) {
        // 💳 Compra con usuario logueado
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
          console.log('[Flow] Orden privada creada OK (async)');
        } catch (e) {
          console.error(
            '[Flow] Error creando orden privada desde webhook (async):',
            e
          );
        }
      } else {
        // 💳 Compra pública (sin login)
        if (!buyerEmail) {
          console.error(
            '[Flow] Falta buyerEmail en compra pública. Metadata:',
            meta
          );
          return;
        }

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
          console.log('[Flow] Orden pública creada OK (async)');
        } catch (e) {
          console.error(
            '[Flow] Error creando orden pública desde webhook (async):',
            e
          );
        }
      }
    } catch (err) {
      console.error('[Flow] Error general en job async del webhook:', err);
    }
  })().catch((err) => {
    console.error('[Flow] Error inesperado fuera del job async:', err);
  });
}
