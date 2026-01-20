import { NextResponse } from "next/server";
import { resetDemoServer } from "@/lib/demo-db.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  resetDemoServer();
  return NextResponse.json(
    { ok: true },
    { headers: { "Cache-Control": "no-store" } }
  );
}
