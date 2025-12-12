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
  successUrl: string; // lo sigue recibiendo pero ya no se usa directo en Flow
  cancelUrl: string;
  metadata: Record<string, string>;
}) {
  if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
    throw new AppError(
      500,
      'No se pudo crear la sesión de pago en Flow: credenciales no configuradas.'
    );
  }

  const { amountCents, currency, metadata } = params;

  // 💰 1) Monto base en centavos (lo que viene del front, SIN comisión)
  const baseAmountCents = amountCents;

  // 💸 2) Comisión 11,19% sobre el monto base (en centavos, redondeado)
  const COMMISSION_RATE = 0.1119;
  const feeCents = Math.round(baseAmountCents * COMMISSION_RATE);

  // 🧮 3) Total con comisión, en centavos
  const totalAmountCents = baseAmountCents + feeCents;

  // 4) Flow espera "amount" en unidades de moneda
  let amount: number;
  if (currency === 'CLP') {
    // CLP NO acepta decimales → entero sí o sí
    amount = Math.round(totalAmountCents / 100);

    if (!Number.isInteger(amount)) {
      // por si acaso, para evitar otro error raro
      throw new AppError(
        500,
        `Monto inválido para Flow (CLP debe ser entero): ${amount}`
      );
    }
  } else {
    // Por si algún día usas otra moneda que sí permita decimales
    amount = totalAmountCents / 100;
  }

  const urlConfirmation = `${PUBLIC_API_BASE_URL}/payments/flow-confirmation`;
  const urlReturn = `${PUBLIC_API_BASE_URL}/payments/flow-browser-return`;

  const bodyParams: Record<string, string | number> = {
    apiKey: FLOW_API_KEY,
    commerceOrder: `order-${Date.now()}`,
    subject: 'Compra entradas TIKETERA',
    currency, // normalmente "CLP"
    amount,   // ✅ ya incluye comisión y es entero en CLP
    email: FLOW_DEFAULT_EMAIL,
    paymentMethod: 9,
    urlConfirmation,
    urlReturn,
  };

  // 👇 Metadatos extendidos: lo tuyo + desglose de comisión
  const extendedMetadata: Record<string, string> = {
    ...(metadata ?? {}),
    baseAmountCents: String(baseAmountCents),
    feeCents: String(feeCents),
    totalAmountCents: String(totalAmountCents),
  };

  if (extendedMetadata && Object.keys(extendedMetadata).length > 0) {
    bodyParams.optional = JSON.stringify(extendedMetadata);
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
