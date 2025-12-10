// apps/api/src/modules/payments/payments.service.ts

import axios from 'axios';
import crypto from 'crypto';
import { AppError } from '../../core/errors/AppError';

const FLOW_API_KEY = process.env.FLOW_API_KEY;
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;
const FLOW_BASE_URL = process.env.FLOW_BASE_URL || 'https://www.flow.cl';

const PUBLIC_API_BASE_URL =
  process.env.PUBLIC_API_BASE_URL || 'https://ticket-chile-api.onrender.com/api';

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
  // 1) ordenar alfabéticamente las claves
  const keys = Object.keys(params).sort();

  // 2) concatenar "clave + valor" sin signos extra
  const toSign = keys.map((k) => `${k}${params[k]}`).join('');

  // 3) HMAC-SHA256 con FLOW_SECRET_KEY
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
  metadata: Record<string, string>;
}) {
  if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
    throw new AppError(
      500,
      'No se pudo crear la sesión de pago en Flow: credenciales no configuradas.'
    );
  }

  const { amountCents, currency, successUrl, metadata } = params;

  // Flow espera "amount" en unidades de moneda, no en centavos
  const amount = amountCents / 100;

  const urlConfirmation = `${PUBLIC_API_BASE_URL}/payments/flow-confirmation`;

  const bodyParams: Record<string, string | number> = {
    apiKey: FLOW_API_KEY,
    commerceOrder: `order-${Date.now()}`, // puedes mejorar esto luego si quieres
    subject: 'Compra entradas TIKETERA',
    currency, // normalmente "CLP"
    amount,
    email: FLOW_DEFAULT_EMAIL,
    paymentMethod: 9, // todos los medios de pago
    urlConfirmation,
    urlReturn: successUrl, // el usuario vuelve a tu frontend
  };

  // 👇 Aquí mandamos los datos del ticket a Flow
  if (metadata && Object.keys(metadata).length > 0) {
    bodyParams.optional = JSON.stringify(metadata);
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

  const bodyParams: Record<string, string> = {
    apiKey: FLOW_API_KEY,
    token,
  };

  const s = signFlowParams(bodyParams);
  const form = new URLSearchParams();

  for (const [k, v] of Object.entries(bodyParams)) {
    form.append(k, v);
  }
  form.append('s', s);

  try {
    const resp = await axios.post(
      `${FLOW_BASE_URL}/api/payment/getStatus`,
      form.toString(),
      {
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
        },
      }
    );

    // 👇 Incluimos optional para leer los datos que mandamos antes
    const data = resp.data as {
      status: number;
      optional?: string;
      // aquí podrías agregar más campos según la doc de Flow
    };

    return data;
  } catch (err: any) {
    console.error(
      'Error consultando estado de pago en Flow:',
      err?.response?.data ?? err
    );
    throw new AppError(500, 'No se pudo obtener el estado del pago en Flow.');
  }
}
