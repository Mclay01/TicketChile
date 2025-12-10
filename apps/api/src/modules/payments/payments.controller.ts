// apps/api/src/modules/payments/payments.controller.ts
import type { Request, Response, NextFunction } from 'express';
import * as paymentsService from './payments.service';
import * as ordersService from '../orders/orders.service';

type FlowOptionalMetadata = {
  mode?: 'PRIVATE' | 'PUBLIC';
  eventId?: string;
  ticketTypeId?: string;
  quantity?: string | number;
  buyerUserId?: string; // para compras con login
  buyerName?: string;   // para compras públicas
  buyerEmail?: string;  // para compras públicas
};

export async function createCheckoutSessionHandler(
  req: Request,
  res: Response,
  next: NextFunction,
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
  _next: NextFunction,
) {
  const token = req.body?.token as string | undefined;
  const s = req.body?.s as string | undefined;

  console.log('[Flow] Confirmación recibida. body =', req.body);

  if (!token || !s) {
    console.warn('[Flow] Webhook sin token o firma');
    return res.status(400).send('Missing token or signature');
  }

  // 1) Validar firma
  const isValid = paymentsService.verifyFlowSignature({ token }, s);
  if (!isValid) {
    console.warn('[Flow] Firma inválida en webhook', { token, s });
    return res.status(400).send('Invalid signature');
  }

  try {
    // 2) Preguntar a Flow el estado del pago
    const payment: any = await paymentsService.getPaymentStatus(token);

    console.log('[Flow] Estado del pago:', payment);

    // Flow suele usar status:
    // 0 = pendiente, 1 = rechazado, 2 = pagado, 3 = anulado
    if (payment.status !== 2) {
      console.log('[Flow] Pago no pagado. status =', payment.status);
      // igual devolvemos 200 para que Flow deje de spamear
      return res.status(200).send('OK');
    }

    // 3) Intentar leer la metadata que mandamos en "optional"
    let meta: FlowOptionalMetadata | null = null;

    if (payment.optional != null) {
      if (typeof payment.optional === 'string') {
        try {
          meta = JSON.parse(payment.optional) as FlowOptionalMetadata;
        } catch (err) {
          console.error(
            '[Flow] No se pudo parsear optional como JSON:',
            payment.optional,
          );
        }
      } else if (typeof payment.optional === 'object') {
        meta = payment.optional as FlowOptionalMetadata;
      }
    }

    if (!meta) {
      console.error(
        '[Flow] Sin metadata optional. No sabemos qué evento/tickets crear.',
      );
      return res.status(200).send('OK');
    }

    const { mode, eventId, ticketTypeId } = meta;
    const quantityNum = Number(meta.quantity ?? 1);

    if (
      !eventId ||
      !ticketTypeId ||
      !Number.isFinite(quantityNum) ||
      quantityNum <= 0
    ) {
      console.error('[Flow] Metadata incompleta o inválida:', meta);
      return res.status(200).send('OK');
    }

    if (mode === 'PRIVATE') {
      if (!meta.buyerUserId) {
        console.error(
          '[Flow] Falta buyerUserId en metadata para compra PRIVATE:',
          meta,
        );
        return res.status(200).send('OK');
      }

      console.log('[Flow] Creando orden (PRIVATE) desde webhook...', {
        userId: meta.buyerUserId,
        eventId,
        ticketTypeId,
        quantity: quantityNum,
      });

      await ordersService.createOrder(meta.buyerUserId, {
        eventId,
        items: [
          {
            ticketTypeId,
            quantity: quantityNum,
          },
        ],
      });
    } else if (mode === 'PUBLIC') {
      if (!meta.buyerEmail) {
        console.error(
          '[Flow] Falta buyerEmail en metadata para compra PUBLIC:',
          meta,
        );
        return res.status(200).send('OK');
      }

      console.log('[Flow] Creando orden (PUBLIC) desde webhook...', {
        eventId,
        ticketTypeId,
        quantity: quantityNum,
        buyerEmail: meta.buyerEmail,
      });

      await ordersService.publicCreateOrderService({
        eventId,
        buyerName: meta.buyerName ?? '',
        buyerEmail: meta.buyerEmail,
        items: [
          {
            ticketTypeId,
            quantity: quantityNum,
          },
        ],
      });
    } else {
      console.error('[Flow] mode inválido en metadata:', meta);
    }

    // Flow sólo necesita 200 para dar por recibido el webhook
    return res.status(200).send('OK');
  } catch (err) {
    console.error('[Flow] Error procesando webhook:', err);
    return res.status(500).send('Internal error');
  }
}
