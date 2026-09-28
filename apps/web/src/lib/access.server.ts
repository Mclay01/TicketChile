import "server-only";
import { NextResponse } from "next/server";
import { operationalLog } from './observability.server';

export class AccessError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function privateJson(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function accessResponse(error: unknown, category: 'unexpected'|'database'|'configuration'|'mail'|'payments'|'media'|'scanner'|'ai' = 'unexpected') {
  if (!(error instanceof AccessError)) {
    const requestId = operationalLog({ action: 'request.failed', category, severity: 'error' });
    const response = privateJson(503, { ok: false, code: 'UNAVAILABLE', error: 'No se pudo completar la solicitud. Intenta nuevamente.', requestId });
    response.headers.set('X-Request-ID', requestId);
    return response;
  }
  return privateJson(error.status, { ok: false, code: error.code, error: error.message });
}

export function identifier(value: unknown): string {
  return typeof value === "string" && /^[a-zA-Z0-9_-]{1,200}$/.test(value) ? value : "";
}

export function requireSameOrigin(request: Request) {
  const origin = request.headers.get("origin");
  if ((origin && origin !== new URL(request.url).origin) || request.headers.get("sec-fetch-site") === "cross-site") {
    throw new AccessError(403, "FORBIDDEN", "Solicitud no permitida.");
  }
}
