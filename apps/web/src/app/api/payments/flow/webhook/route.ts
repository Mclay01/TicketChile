// apps/web/src/app/api/payments/flow/webhook/route.ts
import { NextRequest, NextResponse } from "next/server";
import { withTx } from "@/lib/db";
import { flowGetStatus, flowVerifyWebhookSignature } from "@/lib/flow";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function asRecord(sp: URLSearchParams) {
  const out: Record<string, string> = {};
  for (const [k, v] of sp.entries()) out[k] = String(v ?? "");
  return out;
}

async function readParams(req: NextRequest) {
  // Flow normalmente manda POST x-www-form-urlencoded: token=...
  // pero por si acaso, soportamos GET ?token=
  if (req.method === "GET") {
    return asRecord(req.nextUrl.searchParams);
  }

  const raw = await req.text();
  const sp = new URLSearchParams(raw);
  return asRecord(sp);
}

function flowStatusToPaymentStatus(n: number) {
  // 1 pending, 2 paid, 3 rejected, 4 cancelled
  if (n === 2) return "PAID";
  if (n === 1) return "PENDING";
  if (n === 4) return "CANCELLED";
  if (n === 3) return "FAILED";
  return "PENDING";
}

export async function POST(req: NextRequest) {
  return handle(req);
}

export async function GET(req: NextRequest) {
  // Si Flow te pega GET (tests raros), igual lo aceptamos
  return handle(req);
}

async function handle(req: NextRequest) {
  try {
    const params = await readParams(req);
    const token = String(params.token || "").trim();
    const sig = String(params.s || "").trim();

    if (!token) {
      return NextResponse.json({ ok: false, error: "missing_token" }, { status: 400 });
    }

    // Si viene firma => validarla. Si no viene, no bloqueamos (muchos flows mandan solo token).
    if (sig) {
      const okSig = flowVerifyWebhookSignature(params);
      if (!okSig) {
        return NextResponse.json({ ok: false, error: "invalid_signature" }, { status: 401 });
      }
    }

    // Traer estado real desde Flow
    const st = await flowGetStatus(token);
    const paymentId = String(st?.commerceOrder || "").trim();
    const nextStatus = flowStatusToPaymentStatus(Number(st?.status || 0));

    if (!paymentId) {
      return NextResponse.json({ ok: false, error: "missing_paymentId_from_flow" }, { status: 400 });
    }

    await withTx(async (client) => {
      const pRes = await client.query(
        `
        SELECT id, hold_id, status, provider, provider_ref,
               buyer_name, buyer_email, event_title
        FROM payments
        WHERE id=$1
        LIMIT 1
        FOR UPDATE
        `,
        [paymentId]
      );

      if (pRes.rowCount === 0) {
        // No lo encontramos => no reventamos el webhook (pero dejamos registro)
        console.warn("[flow:webhook] payment not found", { paymentId });
        return;
      }

      const payment = pRes.rows[0];
      const current = String(payment.status || "").toUpperCase();

      // si no es flow, salimos
      if (String(payment.provider || "") !== "flow") return;

      // actualiza provider_ref si no estaba
      if (!payment.provider_ref) {
        await client.query(`UPDATE payments SET provider_ref=$2, updated_at=NOW() WHERE id=$1`, [paymentId, token]);
      }

      // si ya está PAID, idempotencia
      if (current === "PAID") return;

      // Actualizar status
      await client.query(`UPDATE payments SET status=$2, updated_at=NOW() WHERE id=$1`, [paymentId, nextStatus]);

      // Si pagado => emitir/crear orden+tickets
      if (nextStatus === "PAID") {
        const holdId = String(payment.hold_id || "");
        const buyerEmail = String(payment.buyer_email || "");
        const buyerName = String(payment.buyer_name || "");
        const eventTitle = String(payment.event_title || "");

        if (holdId && buyerEmail && buyerName && eventTitle) {
          try {
            await finalizePaidHoldToOrderPgTx(client, {
              holdId,
              eventTitle,
              buyerName,
              buyerEmail,
              paymentId,
            });
          } catch (e) {
            // si ya se finalizó por otra carrera (status endpoint / doble webhook), no rompemos
            console.warn("[flow:webhook] finalize skipped/failed (likely idempotent race)", {
              paymentId,
              msg: (e as any)?.message ?? String(e),
            });
          }
        }
        return;
      }

      // Si FALLA / CANCELED => liberar held y expirar hold
      if (nextStatus === "FAILED" || nextStatus === "CANCELLED") {
        const holdId = String(payment.hold_id || "");
        if (!holdId) return;

        const hi = await client.query(
          `SELECT event_id, ticket_type_id, qty
             FROM hold_items
            WHERE hold_id=$1`,
          [holdId]
        );

        for (const row of hi.rows) {
          await client.query(
            `UPDATE ticket_types
               SET held = GREATEST(held - $3, 0)
             WHERE event_id = $1 AND id = $2`,
            [String(row.event_id), String(row.ticket_type_id), Number(row.qty)]
          );
        }

        await client.query(`UPDATE holds SET status='EXPIRED' WHERE id=$1`, [holdId]);
      }
    });

    // Flow suele aceptar 200 OK. Respuesta simple.
    return new NextResponse("OK", { status: 200 });
  } catch (err: any) {
    console.error("[flow:webhook][err]", err?.message ?? String(err));
    // Igual 200 para evitar retries infinitos por errores internos puntuales
    return new NextResponse("OK", { status: 200 });
  }
}
