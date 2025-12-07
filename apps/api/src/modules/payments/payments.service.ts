// apps/api/src/modules/payments/payments.service.ts

import axios from 'axios';
import crypto from 'crypto';
import { AppError } from '../../core/errors/AppError';

const FLOW_API_KEY = process.env.FLOW_API_KEY;
const FLOW_SECRET_KEY = process.env.FLOW_SECRET_KEY;
const FLOW_BASE_URL = process.env.FLOW_BASE_URL || 'https://www.flow.cl';

// ⚠️ IMPORTANTE: pon aquí la URL PÚBLICA DE TU API (Render, por ejemplo)
// y en .env prod define PUBLIC_API_BASE_URL con esa misma URL.
const PUBLIC_API_BASE_URL =
  process.env.PUBLIC_API_BASE_URL || 'http://localhost:4000/api';

// Email que Flow acepta como válido.
// En .env agrega: FLOW_DEFAULT_EMAIL=tu-correo-registrado-en-Flow
const FLOW_DEFAULT_EMAIL =
  process.env.FLOW_DEFAULT_EMAIL ||
  process.env.MAIL_FROM || // ya lo usas para correos
  'soporte@tiketera.cl';

if (!FLOW_API_KEY || !FLOW_SECRET_KEY) {
  console.warn(
    '[payments] FLOW no está configurado. Faltan FLOW_API_KEY / FLOW_SECRET_KEY.'
  );
}

/**
 * Firma parámetros para Flow según su documentación.
 */
function signFlowParams(params: Record<string, any>) {
  const ordered = Object.keys(params)
    .sort()
    .reduce((acc: any, key) => {
      acc[key] = params[key];
      return acc;
    }, {});

  const query = Object.entries(ordered)
    .map(([k, v]) => `${k}=${v}`)
    .join('&');

  return crypto
    .createHmac('sha256', FLOW_SECRET_KEY!)
    .update(query)
    .digest('hex');
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

  const { amountCents, currency, successUrl } = params;

  // Flow espera "amount" en unidades de moneda, no en centavos
  const amount = amountCents / 100;

  // URL donde Flow llama para confirmar el pago
  const urlConfirmation = `${PUBLIC_API_BASE_URL}/payments/flow-confirmation`;

  const bodyParams: Record<string, string | number> = {
    apiKey: FLOW_API_KEY,
    commerceOrder: `order-${Date.now()}`,
    subject: 'Compra entradas TIKETERA',
    currency, // normalmente "CLP"
    amount,
    email: FLOW_DEFAULT_EMAIL, // 👈 correo válido para Flow
    paymentMethod: 9, // todos los medios de pago
    urlConfirmation,
    urlReturn: successUrl, // el usuario vuelve a tu frontend
  };

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
