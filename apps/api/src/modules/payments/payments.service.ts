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
  successUrl: string; // lo seguimos recibiendo, aunque Flow ya no lo usa directo
  cancelUrl: string;
  metadata?: Record<string, string>;
}) {
  if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
    throw new AppError(
      500,
      'No se pudo crear la sesión de pago en Flow: credenciales no configuradas.'
    );
  }

  // --- desestructuramos y damos default a metadata ---
  const { amountCents, currency, metadata = {} } = params;

  // =====================================================
  // 1) Cálculo de base + comisión (11,19%) SOLO para uso interno
  //    amountCents ya viene con la comisión incluida desde el frontend.
  // =====================================================
  const baseAmountCents = Math.round(amountCents / 1.1119);
  const feeCents = amountCents - baseAmountCents;
  const totalAmountCents = baseAmountCents + feeCents;

  // Flow quiere el monto en pesos CLP, entero, sin decimales
  const amount = Math.round(totalAmountCents / 100);

  const urlConfirmation = `${PUBLIC_API_BASE_URL}/payments/flow-confirmation`;
  // Flow vuelve al backend, no directo al frontend
  const urlReturn = `${PUBLIC_API_BASE_URL}/payments/flow-browser-return`;

  const bodyParams: Record<string, string | number> = {
    apiKey: FLOW_API_KEY,
    commerceOrder: `order-${Date.now()}`,
    subject: 'Compra entradas TIKETERA',
    currency, // normalmente "CLP"
    amount,
    email: FLOW_DEFAULT_EMAIL,
    paymentMethod: 9,
    urlConfirmation,
    urlReturn,
  };

  // =====================================================
  // 2) OPTIONAL: mandar SOLO metadatos "cortos" a Flow
  //    (para no pasar el límite y mantener compatibilidad
  //     con tu código de flow-confirmation).
  // =====================================================
  const safeMetadata: Record<string, string> = {};

  const allowedKeys = [
    'mode',
    'eventId',
    'ticketTypeId',
    'quantity',
    'buyerName',
    'buyerEmail',
    'buyerUserId',
  ] as const;

  for (const key of allowedKeys) {
    const value = metadata[key];
    if (typeof value === 'string' && value.length > 0) {
      safeMetadata[key] = value;
    }
  }

  // Como plus, podemos guardar la info de comisión con claves súper cortas
  // (pero esto es opcional, si quieres puedes borrar este bloque).
  safeMetadata.baseAmountCents = String(baseAmountCents);
  safeMetadata.feeCents = String(feeCents);
  safeMetadata.totalAmountCents = String(totalAmountCents);

  if (Object.keys(safeMetadata).length > 0) {
    const optionalStr = JSON.stringify(safeMetadata);

    // Si por alguna razón se pasa de, no sé, 1000 chars, recortamos lo menos importante.
    const MAX_OPTIONAL_LENGTH = 1000;
    bodyParams.optional =
      optionalStr.length > MAX_OPTIONAL_LENGTH
        ? JSON.stringify({
            // dejamos solo lo realmente crítico
            mode: safeMetadata.mode,
            eventId: safeMetadata.eventId,
            ticketTypeId: safeMetadata.ticketTypeId,
            quantity: safeMetadata.quantity,
            buyerEmail: safeMetadata.buyerEmail,
          })
        : optionalStr;
  }

  // =====================================================
  // 3) Firmar y llamar a Flow
  // =====================================================
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
      }
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
