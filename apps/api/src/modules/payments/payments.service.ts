// apps/api/src/modules/payments/payments.service.ts

import axios from 'axios';
import crypto from 'crypto';
import { AppError } from '../../core/errors/AppError';

const FLOW_API_KEY = process.env.FLOW_API_KEY;
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;
const FLOW_BASE_URL = process.env.FLOW_BASE_URL || 'https://www.flow.cl';

const PUBLIC_API_BASE_URL =
  process.env.PUBLIC_API_BASE_URL ||
  'https://ticket-chile-api.onrender.com/api';

const FLOW_DEFAULT_EMAIL =
  process.env.FLOW_DEFAULT_EMAIL ||
  process.env.MAIL_FROM ||
  'soporte@tiketera.cl';

if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
  console.warn(
    '[payments] FLOW no está configurado. Faltan FLOW_API_KEY / FLOW_SECRET_KEY.'
  );
}

/** Firma parámetros para Flow según su documentación. */
function signFlowParams(params: Record<string, any>) {
  // Flow exige concatenar "key + value" ordenado alfabéticamente, sin signos =
  const keys = Object.keys(params).sort();

  let toSign = '';
  for (const key of keys) {
    const value = params[key];
    toSign += `${key}${value}`;
  }

  return crypto
    .createHmac('sha256', FLOW_SECRET_KEY!)
    .update(toSign)
    .digest('hex');
}

/** Verifica la firma que Flow nos manda en el webhook. */
export function verifyFlowSignature(
  payload: Record<string, any>,
  signature: string
) {
  const expected = signFlowParams(payload);
  return expected === signature;
}

export async function createCheckoutSession(params: {
  amountCents: number;
  currency: string;
  successUrl: string;
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
    throw new AppError(
      500,
      'No se pudo crear la sesión de pago en Flow: credenciales no configuradas.',
    );
  }

  const { amountCents, currency, metadata } = params;

  // Flow espera amount sin decimales
  const amount = Math.round(amountCents / 100);

  const urlConfirmation = `${PUBLIC_API_BASE_URL}/payments/flow-confirmation`;
  const urlReturn = `${PUBLIC_API_BASE_URL}/payments/flow-browser-return`;

  const bodyParams: Record<string, string | number> = {
    apiKey: FLOW_API_KEY,
    commerceOrder: `order-${Date.now()}`,
    subject: 'Compra entradas TIKETERA',
    currency,
    amount,
    email: FLOW_DEFAULT_EMAIL,
    paymentMethod: 9,
    urlConfirmation,
    urlReturn,
  };

  // --- filtrar y acotar metadata para Flow.optional ---
  if (metadata && Object.keys(metadata).length > 0) {
    const allowedKeys = [
      'mode',
      'eventId',
      'ticketTypeId',
      'quantity',
      'buyerName',
      'buyerEmail',
      'buyerUserId',
    ] as const;

    const safe: Record<string, string> = {};
    const MAX_NAME_LENGTH = 40;
    const MAX_EMAIL_LENGTH = 60;

    for (const key of allowedKeys) {
      const raw = metadata[key];
      if (typeof raw !== 'string') continue;

      let value = raw.trim();
      if (key === 'buyerName' && value.length > MAX_NAME_LENGTH) {
        value = value.slice(0, MAX_NAME_LENGTH);
      }
      if (key === 'buyerEmail' && value.length > MAX_EMAIL_LENGTH) {
        value = value.slice(0, MAX_EMAIL_LENGTH);
      }
      if (value) safe[key] = value;
    }

    if (Object.keys(safe).length > 0) {
      const json = JSON.stringify(safe);

      // límite conservador (Flow corta alrededor de 255 chars)
      if (json.length > 255) {
        throw new AppError(
          400,
          'Los datos de comprador son demasiado largos para el pago en Flow. Intenta con un nombre/correo más corto.',
        );
      }

      bodyParams.optional = json;
    }
  }

  const s = signFlowParams(bodyParams);
  const form = new URLSearchParams();
  for (const [k, v] of Object.entries(bodyParams)) {
    form.append(k, String(v));
  }
  form.append('s', s);

  try {
    const resp = await axios.post(
      `${FLOW_BASE_URL}/api/payment/create`,
      form.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      },
    );

    const data = resp.data as {
      url: string;
      token: string;
      flowOrder: number;
    };

    const checkoutUrl = `${data.url}?token=${data.token}`;
    return checkoutUrl;
  } catch (err: any) {
    console.error('Error creando pago en Flow:', err?.response?.data ?? err);
    throw new AppError(500, 'No se pudo crear la sesión de pago en Flow.');
  }
}



/** Llama a Flow para saber el estado del pago. */
export async function getPaymentStatus(token: string) {
  if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
    throw new AppError(500, 'FLOW no está configurado.');
  }

  // Parámetros que Flow espera para getStatus
  const baseParams: Record<string, string> = {
    apiKey: FLOW_API_KEY,
    token,
  };

  // Firmamos igual que en create
  const s = signFlowParams(baseParams);

  try {
    // 👇 OJO: ahora es GET y los params van por query-string
    const resp = await axios.get(`${FLOW_BASE_URL}/api/payment/getStatus`, {
      params: {
        ...baseParams,
        s,
      },
    });

    const data = resp.data as {
      status?: number;
      optional?: string;
      code?: number;
      message?: string;
    };

    console.log('[Flow] Respuesta getStatus:', data);

    // Si Flow manda un código de error, lo tratamos como fallo
    if (typeof data.code !== 'undefined' && data.code !== 0) {
      console.error('[Flow] getStatus devolvió error:', data);
      throw new AppError(
        500,
        `No se pudo obtener el estado del pago en Flow. Código: ${data.code}`
      );
    }

    return data;
  } catch (err: any) {
    console.error(
      'Error consultando estado de pago en Flow:',
      err?.response?.data ?? err
    );
    throw new AppError(500, 'No se pudo obtener el estado del pago en Flow.');
  }
}
