// apps/web/src/lib/flow.ts
import { createHmac, timingSafeEqual } from "node:crypto";

export type FlowStatus = {
  flowOrder: number;
  commerceOrder: string;
  requestDate: string;
  status: number; // 1 pending, 2 paid, 3 rejected, 4 cancelled
  subject: string;
  currency: string;
  amount: number;
  payer: string;
  optional?: any;
  paymentData?: any;
};

function mustEnv(name: string) {
  const v = process.env[name];
  if (!v) throw new Error(`Falta ${name}`);
  return v;
}

export function flowBaseUrl() {
  // Tu env FLOW_BASE_URL puede ser:
  // - prod:    https://www.flow.cl/api  (clásico)
  // - sandbox: https://sandbox.flow.cl/api
  // En tu código venías usando https://api.flow.cl (alias).
  return process.env.FLOW_BASE_URL || "https://api.flow.cl";
}

export function flowSign(params: Record<string, string>) {
  const secretKey = mustEnv("FLOW_SECRET_KEY");
  const keys = Object.keys(params).sort();
  let toSign = "";
  for (const k of keys) toSign += k + params[k];
  return createHmac("sha256", secretKey).update(toSign).digest("hex");
}

function safeEqHex(a: string, b: string) {
  const aa = String(a || "").trim().toLowerCase();
  const bb = String(b || "").trim().toLowerCase();
  if (!aa || !bb || aa.length !== bb.length) return false;
  try {
    const ba = Buffer.from(aa, "hex");
    const bb2 = Buffer.from(bb, "hex");
    if (ba.length !== bb2.length) return false;
    return timingSafeEqual(ba, bb2);
  } catch {
    return false;
  }
}

/**
 * Verificación de firma para webhook/confirmación.
 * Flow puede mandarte:
 * - token + s
 * - o token (sin s) en algunos setups.
 *
 * Aquí: si viene "s" => validamos.
 * Intentamos 2 variantes por compatibilidad:
 *  A) firmar exactamente los params recibidos (sin s)
 *  B) si no venía apiKey, probamos agregando apiKey desde env
 */
export function flowVerifyWebhookSignature(received: Record<string, string>) {
  const provided = String(received?.s || "").trim();
  if (!provided) return false;

  const params: Record<string, string> = { ...received };
  delete params.s;

  // Variante A
  const expectedA = flowSign(params);
  if (safeEqHex(provided, expectedA)) return true;

  // Variante B: si no venía apiKey, lo agregamos
  if (!params.apiKey) {
    const apiKey = process.env.FLOW_API_KEY;
    if (apiKey) {
      const expectedB = flowSign({ apiKey, ...params });
      if (safeEqHex(provided, expectedB)) return true;
    }
  }

  return false;
}

export async function flowCreatePayment(args: {
  commerceOrder: string;
  subject: string;
  amount: number;
  currency?: "CLP";
  email: string;
  urlReturn: string;
  urlConfirmation: string;
  timeoutSeconds?: number; // ej 900
  optional?: any; // object -> JSON
}) {
  const apiKey = mustEnv("FLOW_API_KEY");
  const base = flowBaseUrl();

  const params: Record<string, string> = {
    apiKey,
    commerceOrder: args.commerceOrder,
    subject: args.subject,
    currency: args.currency || "CLP",
    amount: String(Math.round(args.amount)),
    email: args.email,
    urlReturn: args.urlReturn,
    urlConfirmation: args.urlConfirmation,
  };

  if (args.timeoutSeconds) params.timeout = String(args.timeoutSeconds);
  if (args.optional !== undefined) params.optional = JSON.stringify(args.optional);

  params.s = flowSign(params);

  const body = new URLSearchParams(params);

  const r = await fetch(`${base}/payment/create`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const raw = await r.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!r.ok) {
    const msg = data?.message || data?.error?.message || raw || `HTTP ${r.status}`;
    throw new Error(`Flow create failed: ${msg}`);
  }

  const url = String(data?.url || "");
  const token = String(data?.token || "");
  const flowOrder = Number(data?.flowOrder || 0);

  if (!url || !token) throw new Error("Flow create: respuesta inválida (sin url/token).");

  return { url, token, flowOrder };
}

export async function flowGetStatus(token: string): Promise<FlowStatus> {
  const apiKey = mustEnv("FLOW_API_KEY");
  const base = flowBaseUrl();

  const params: Record<string, string> = { apiKey, token };
  params.s = flowSign(params);

  const qs = new URLSearchParams(params).toString();
  const r = await fetch(`${base}/payment/getStatus?${qs}`, { method: "GET" });

  const raw = await r.text();
  let data: any = null;
  try {
    data = raw ? JSON.parse(raw) : null;
  } catch {
    data = null;
  }

  if (!r.ok) {
    const msg = data?.message || data?.error?.message || raw || `HTTP ${r.status}`;
    throw new Error(`Flow getStatus failed: ${msg}`);
  }

  return data as FlowStatus;
}
