import crypto from "crypto";

type FlowParams = Record<string, string>;

export function getFlowConfig() {
  const apiKey = process.env.FLOW_API_KEY;
  const secretKey = process.env.FLOW_SECRET_KEY;
  const baseUrl = process.env.FLOW_BASE_URL || "https://www.flow.cl/api";

  if (!apiKey || !secretKey) {
    throw new Error("Missing FLOW_API_KEY or FLOW_SECRET_KEY");
  }

  return { apiKey, secretKey, baseUrl };
}

/**
 * Flow signature:
 * - Ordena keys alfabéticamente
 * - Concatena key + value
 * - HMAC-SHA256 con secretKey
 */ // :contentReference[oaicite:2]{index=2}
export function signFlowParams(params: FlowParams, secretKey: string) {
  const keys = Object.keys(params).sort();
  const toSign = keys.map((k) => `${k}${params[k]}`).join("");
  return crypto.createHmac("sha256", secretKey).update(toSign).digest("hex");
}

export async function flowPost<T>(path: string, params: FlowParams) {
  const { secretKey, baseUrl } = getFlowConfig();
  const s = signFlowParams(params, secretKey);

  const body = new URLSearchParams({ ...params, s }).toString();

  const res = await fetch(`${baseUrl}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body,
  });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {
    // Flow debería devolver JSON; si no, devolvemos texto para debug
  }

  if (!res.ok) {
    throw new Error(
      `Flow POST ${path} failed: ${res.status} ${res.statusText} | ${text}`
    );
  }

  return json as T;
}

export async function flowGet<T>(path: string, params: FlowParams) {
  const { secretKey, baseUrl } = getFlowConfig();
  const s = signFlowParams(params, secretKey);

  const url = new URL(`${baseUrl}${path}`);
  Object.entries({ ...params, s }).forEach(([k, v]) => url.searchParams.set(k, v));

  const res = await fetch(url.toString(), { method: "GET" });

  const text = await res.text();
  let json: any = null;
  try {
    json = JSON.parse(text);
  } catch {}

  if (!res.ok) {
    throw new Error(
      `Flow GET ${path} failed: ${res.status} ${res.statusText} | ${text}`
    );
  }

  return json as T;
}
