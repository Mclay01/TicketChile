import { NextResponse } from "next/server";
import { flowGet, getFlowConfig } from "../_lib/flow";

export const runtime = "nodejs";
export const preferredRegion = ["gru1"];

export async function GET(req: Request) {
  try {
    const { searchParams } = new URL(req.url);
    const token = String(searchParams.get("token") || "").trim();
    if (!token) return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });

    const { apiKey } = getFlowConfig();
    const status = await flowGet("/payment/getStatus", { apiKey, token }); // :contentReference[oaicite:11]{index=11}
    return NextResponse.json({ ok: true, status });
  } catch (err: any) {
    return NextResponse.json({ ok: false, error: err?.message || "Status error" }, { status: 500 });
  }
}
