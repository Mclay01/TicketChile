import "server-only";
import { NextResponse } from "next/server";

export class AccessError extends Error {
  constructor(public status: number, public code: string, message: string) {
    super(message);
  }
}

export function privateJson(status: number, body: unknown) {
  return NextResponse.json(body, { status, headers: { "Cache-Control": "private, no-store" } });
}

export function accessResponse(error: unknown) {
  return error instanceof AccessError
    ? privateJson(error.status, { ok: false, code: error.code, error: error.message })
    : privateJson(503, { ok: false, code: "UNAVAILABLE", error: "No se pudo completar la solicitud. Intenta nuevamente." });
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
