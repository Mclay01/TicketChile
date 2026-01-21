import { NextResponse } from "next/server";
import { releaseHoldServer } from "@/lib/demo-db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

export async function POST(req: Request) {
  let body: any;
  try {
    body = await req.json();
  } catch {
    return json(400, { ok: false, error: "Body inválido (JSON)." });
  }

  const holdId = String(body?.holdId ?? "").trim();
  if (!holdId) return json(400, { ok: false, error: "Falta holdId." });

  const res = await releaseHoldServer(holdId);
  return json(200, res);
}
