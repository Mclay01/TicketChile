import { NextResponse } from "next/server";
import { flowGet, getFlowConfig } from "../_lib/flow";

export const runtime = "nodejs";
export const preferredRegion = ["gru1"];

type FlowPaymentStatus = {
  flowOrder: number;
  commerceOrder: string;
  status: number; // 1 pagado (según ejemplos), etc.
  amount: number;
  payer: string;
  optional?: Record<string, any>;
}; // :contentReference[oaicite:9]{index=9}

export async function POST(req: Request) {
  try {
    const form = await req.formData();
    const token = String(form.get("token") || "").trim();

    if (!token) {
      return NextResponse.json({ ok: false, error: "Missing token" }, { status: 400 });
    }

    const { apiKey } = getFlowConfig();

    // getStatus requiere apiKey, token, s :contentReference[oaicite:10]{index=10}
    const status = await flowGet<FlowPaymentStatus>("/payment/getStatus", {
      apiKey,
      token,
    });

    // Aquí actualizas tu DB:
    // - Si status.status indica pagado, marcas la orden como PAID y emites tickets
    // - Si no, la marcas FAILED/REJECTED/etc.
    // await upsertPaymentResult(status);

    // Flow espera 200 OK para considerar recibido el callback.
    return NextResponse.json({ ok: true });
  } catch (err: any) {
    // Igual responde 200 a Flow si prefieres evitar reintentos,
    // pero para debug es mejor 500 (a tu criterio).
    return NextResponse.json(
      { ok: false, error: err?.message || "Confirm error" },
      { status: 500 }
    );
  }
}
