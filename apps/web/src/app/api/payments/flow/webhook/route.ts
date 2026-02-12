// apps/web/src/app/api/payments/flow/webhook/route.ts
import { NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { flowGetStatus } from "@/lib/flow";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function pickFormValue(obj: Record<string, string>, key: string) {
  return String(obj[key] || "").trim();
}

async function readBodyAsKV(req: Request): Promise<Record<string, string>> {
  const ct = req.headers.get("content-type") || "";
  const out: Record<string, string> = {};

  if (ct.includes("application/json")) {
    const j = await req.json().catch(() => ({}));
    for (const [k, v] of Object.entries(j || {})) out[k] = String(v ?? "");
    return out;
  }

  // x-www-form-urlencoded o cualquier texto parseable
  const raw = await req.text().catch(() => "");
  const sp = new URLSearchParams(raw);
  for (const [k, v] of sp.entries()) out[k] = v;
  return out;
}

export async function POST(req: Request) {
  try {
    const form = await readBodyAsKV(req);

    // Flow típicamente manda `token`. A veces también `commerceOrder`.
    const tokenFromWebhook = pickFormValue(form, "token");
    const commerceOrder = pickFormValue(form, "commerceOrder"); // en create: commerceOrder = paymentId

    // Flow reintenta si no respondes 200, así que siempre devolvemos 200 al final.
    await withTx(async (client) => {
      // Buscar payment por:
      // 1) id = commerceOrder (si viene)
      // 2) provider_ref = token (si no viene commerceOrder)
      const pRes = await client.query(
        `
        SELECT id, hold_id, status, provider_ref, buyer_name, buyer_email, event_title
        FROM payments
        WHERE
          ( $1 <> '' AND id = $1 )
          OR ( $2 <> '' AND provider = 'flow' AND provider_ref = $2 )
        LIMIT 1
        FOR UPDATE
        `,
        [commerceOrder, tokenFromWebhook]
      );

      if (pRes.rowCount === 0) return;

      const p = pRes.rows[0];
      const paymentId = String(p.id);
      const holdId = String(p.hold_id || "");
      const currentStatus = String(p.status || "").toUpperCase();

      // Usa token del webhook o el guardado en DB
      const token = tokenFromWebhook || String(p.provider_ref || "");
      if (!token) return;

      // Consultar estado real a Flow
      let st;
      try {
        st = await flowGetStatus(token);
      } catch {
        // si Flow falla, no rompemos el webhook (evita loops)
        return;
      }

      // Flow status:
      // 1 pending, 2 paid, 3 rejected, 4 cancelled
      const s = Number(st.status);

      if (s === 2) {
        // PAID
        if (currentStatus !== "PAID") {
          await client.query(
            `UPDATE payments
               SET status='PAID', paid_at=NOW(), updated_at=NOW()
             WHERE id=$1`,
            [paymentId]
          );
        }

        // Emitir tickets (idempotente)
        const buyerName = String(p.buyer_name || "");
        const buyerEmail = String(p.buyer_email || "");
        const eventTitle = String(p.event_title || "");

        if (holdId && buyerEmail.includes("@") && buyerName.length >= 2 && eventTitle) {
          try {
            await finalizePaidHoldToOrderPgTx(client, {
              holdId,
              eventTitle,
              buyerName,
              buyerEmail,
              paymentId,
            });
          } catch {
            // idempotente: si otra request ganó la carrera, ok
          }
        }
        return;
      }

      if (s === 3) {
        // rejected => FAILED
        await client.query(`UPDATE payments SET status='FAILED', updated_at=NOW() WHERE id=$1`, [paymentId]);
        return;
      }

      if (s === 4) {
        // cancelled => CANCELLED
        await client.query(`UPDATE payments SET status='CANCELLED', updated_at=NOW() WHERE id=$1`, [paymentId]);
        return;
      }

      // s === 1 => PENDING
      if (currentStatus !== "PENDING") {
        await client.query(`UPDATE payments SET status='PENDING', updated_at=NOW() WHERE id=$1`, [paymentId]);
      }
    });

    return json(200, { ok: true });
  } catch {
    // NUNCA devuelvas 500: Flow te reintenta y te hace spam
    return json(200, { ok: true, swallowed: true });
  }
}
