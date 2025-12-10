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
  console.log('[Flow] Webhook recibido. body =', req.body, 'query =', req.query);

  const body = (req as any).body ?? {};
  const query = (req as any).query ?? {};

  const token = (body.token || query.token) as string | undefined;
  const s = (body.s || query.s) as string | undefined;

  if (!token) {
    console.warn('[Flow] Webhook sin token. body =', body, 'query =', query);
    return res.status(400).send('Missing token');
  }

  // Si Flow no te manda firma, seguimos igual (no paramos el flujo).
  if (!s) {
    console.warn(
      '[Flow] Webhook sin firma (s). Continuando sin verificar firma. token =',
      token
    );
  } else {
    const isValid = paymentsService.verifyFlowSignature({ token }, s);
    if (!isValid) {
      console.warn('[Flow] Firma inválida en webhook', { token, s });
      // Para producción podrías cortar aquí con 400, pero para pruebas seguimos.
    }
  }

  try {
    const payment = await paymentsService.getPaymentStatus(token);
    console.log('[Flow] Estado del pago:', payment);

    if (payment.status === 2) {
      console.log('[Flow] Pago pagado. Procesando creación de orden...');

      let meta: any = null;

      // 👇 AHORA soportamos optional como string o como objeto
      if ((payment as any).optional) {
        const opt = (payment as any).optional;
        if (typeof opt === 'string') {
          try {
            meta = JSON.parse(opt);
          } catch (e) {
            console.error(
              '[Flow] No se pudo parsear payment.optional (string):',
              opt
            );
          }
        } else if (typeof opt === 'object') {
          meta = opt;
        }
      }

      if (!meta) {
        console.warn(
          '[Flow] Pago sin metadata (optional). No se puede crear la orden.'
        );
      } else {
        console.log('[Flow] Metadata usada para crear orden:', meta);

        const mode = meta.mode as 'PUBLIC' | 'PRIVATE' | undefined;
        const eventId = meta.eventId as string | undefined;
        const ticketTypeId = meta.ticketTypeId as string | undefined;
        const quantity = Number(meta.quantity ?? 1);
        const buyerEmail = meta.buyerEmail as string | undefined;
        const buyerName = (meta.buyerName as string | undefined) ?? '';
        const buyerUserId = meta.buyerUserId as string | undefined;

        if (!eventId || !ticketTypeId || !quantity || quantity <= 0) {
          console.error('[Flow] Metadata incompleta. No se crea la orden.', meta);
        } else if (mode === 'PRIVATE' && buyerUserId) {
          console.log('[Flow] Creando orden PRIVADA para userId:', buyerUserId);
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
            console.log('[Flow] Creando orden PÚBLICA para email:', buyerEmail);
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
