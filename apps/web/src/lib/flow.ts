// apps/web/src/lib/flow.ts
import { createHmac } from "node:crypto";

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
  // prod: https://www.flow.cl/api
  // sandbox: https://sandbox.flow.cl/api
  return process.env.FLOW_BASE_URL || "https://www.flow.cl/api";
}

/**
 * Firma: ordenar keys y concatenar key+value, HMAC-SHA256(secretKey), hex
 * (exactamente como documenta Flow)
 */
export function flowSign(params: Record<string, string>) {
  const secretKey = mustEnv("FLOW_SECRET_KEY");
  const keys = Object.keys(params).sort();
  let toSign = "";
  for (const k of keys) toSign += k + params[k];
  return createHmac("sha256", secretKey).update(toSign).digest("hex");
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

  // Para redirigir: url + "?token=" + token
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
