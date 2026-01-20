// apps/web/src/app/(public)/checkout/success/page.tsx
import Link from "next/link";
import { stripe } from "@/lib/stripe.server";
import { pool } from "@/lib/db";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";
import SuccessClient from "./SuccessClient";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type SP = Record<string, string | string[] | undefined>;

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function firstParam(sp: SP, key: string) {
  const v = sp?.[key];
  return Array.isArray(v) ? v[0] : v;
}

export default async function CheckoutSuccessPage(props: {
  searchParams: Promise<SP> | SP;
}) {
  // ✅ Next 16: searchParams puede venir como Promise
  const sp = await Promise.resolve(props.searchParams);

  const sessionId = pickString(firstParam(sp, "session_id"));
  if (!sessionId) {
    return (
      <div className="min-h-screen bg-black text-white">
        <div className="mx-auto max-w-2xl px-6 py-12">
          <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
            <h1 className="text-2xl font-semibold tracking-tight">Falta session_id</h1>
            <p className="mt-2 text-sm text-white/70">
              Stripe no nos devolvió el identificador de sesión. Sin eso no puedo confirmar nada.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              <Link
                href="/eventos"
                className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
              >
                Volver a eventos
              </Link>
              <Link
                href="/mis-tickets"
                className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
              >
                Ir a Mis tickets
              </Link>
            </div>
          </div>
        </div>
      </div>
    );
  }

  let paid = false;
  let paymentStatus = "";
  let buyerEmail = "";
  let buyerName = "";
  let eventTitle = "";
  let holdId = "";
  let paymentId = "";
  let orderId = "";

  // 1) Lee Stripe (fuente “verdad” del pago)
  try {
    const session = await stripe.checkout.sessions.retrieve(sessionId);

    const ps = String((session as any)?.payment_status || "");
    paid = ps === "paid";
    paymentStatus = ps || paymentStatus;

    buyerEmail =
      String((session as any)?.customer_details?.email || "") ||
      String((session as any)?.customer_email || "") ||
      buyerEmail;

    buyerName = String((session as any)?.customer_details?.name || "") || buyerName;

    const md: any = (session as any)?.metadata || {};
    holdId = String(md?.holdId || holdId);
    paymentId = String(md?.paymentId || paymentId);
    eventTitle = String(md?.eventTitle || eventTitle);
  } catch {
    // si falla Stripe (raro), seguimos con DB
  }

  // 2) DB: reconciliar y (si está PAID) intentar “fulfill” aquí mismo
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // Busca payment por id (si vino en metadata) o por provider_ref=sessionId o por holdId
    let pRes;
    if (paymentId) {
      pRes = await client.query(
        `
        SELECT *
        FROM payments
        WHERE id=$1 AND provider='stripe'
        FOR UPDATE
        `,
        [paymentId]
      );
    } else {
      pRes = await client.query(
        `
        SELECT *
        FROM payments
        WHERE provider='stripe' AND provider_ref=$1
        FOR UPDATE
        `,
        [sessionId]
      );
    }

    if ((!pRes || pRes.rowCount === 0) && holdId) {
      pRes = await client.query(
        `
        SELECT *
        FROM payments
        WHERE provider='stripe' AND hold_id=$1
        FOR UPDATE
        `,
        [holdId]
      );
    }

    if (pRes && pRes.rowCount > 0) {
      const p = pRes.rows[0];

      paymentId = paymentId || String(p.id || "");
      holdId = holdId || String(p.hold_id || "");
      buyerEmail = buyerEmail || String(p.buyer_email || "");
      buyerName = buyerName || String(p.buyer_name || "");
      eventTitle = eventTitle || String(p.event_title || "");
      paymentStatus = paymentStatus || String(p.status || "");

      // Asegura provider_ref = sessionId (sin pisar si ya existe)
      if (!p.provider_ref) {
        await client.query(
          `UPDATE payments SET provider_ref=$2, updated_at=NOW() WHERE id=$1`,
          [p.id, sessionId]
        );
      }

      // Si Stripe dice paid, marca PAID en DB (idempotente)
      if (paid) {
        await client.query(
          `
          UPDATE payments
          SET status='PAID',
              paid_at = COALESCE(paid_at, NOW()),
              updated_at = NOW()
          WHERE id=$1 AND provider='stripe'
          `,
          [p.id]
        );
        paymentStatus = "PAID";

        // ✅ Intento de emisión inmediata (igual el webhook sirve de backup)
        // Canon: usa los datos guardados en payments si existen.
        const finalBuyerEmail = buyerEmail || String(p.buyer_email || "");
        const finalBuyerName = buyerName || String(p.buyer_name || "");
        const finalEventTitle = eventTitle || String(p.event_title || "");

        if (holdId && finalBuyerEmail.includes("@") && finalBuyerName.length >= 2 && finalEventTitle) {
          await finalizePaidHoldToOrderPgTx(client, {
            holdId,
            eventTitle: finalEventTitle,
            buyerName: finalBuyerName,
            buyerEmail: finalBuyerEmail,
          });
        }

        // Vincula order_id en payments si ya existe
        const oRes = await client.query(`SELECT id FROM orders WHERE hold_id=$1 LIMIT 1`, [holdId]);
        if (oRes.rowCount > 0) {
          orderId = String(oRes.rows[0].id || "");
          await client.query(
            `UPDATE payments SET order_id=$2, updated_at=NOW() WHERE id=$1`,
            [p.id, orderId]
          );
        }
      } else {
        // si no está paid, deja status como esté (PENDING/CREATED/etc.)
        paymentStatus = paymentStatus || String(p.status || "");
      }
    }

    await client.query("COMMIT");
  } catch {
    try {
      await client.query("ROLLBACK");
    } catch {}
  } finally {
    client.release();
  }

  const misTicketsHref = buyerEmail
    ? `/mis-tickets?email=${encodeURIComponent(buyerEmail)}&paid=1`
    : `/mis-tickets?paid=1`;

  return (
    <div className="min-h-screen bg-black text-white">
      <div className="mx-auto max-w-2xl px-6 py-12">
        <div className="rounded-3xl border border-white/10 bg-white/5 p-8">
          <div className="flex items-start gap-4">
            <div
              className={[
                "grid h-12 w-12 place-items-center rounded-2xl border",
                paid ? "border-emerald-500/30 bg-emerald-500/10" : "border-white/10 bg-black/30",
              ].join(" ")}
              aria-hidden="true"
            >
              {paid ? "✅" : "⏳"}
            </div>

            <div className="flex-1">
              <h1 className="text-2xl font-semibold tracking-tight">
                {paid ? "Pago confirmado" : "Estamos procesando tu pago"}
              </h1>

              <p className="mt-1 text-sm text-white/70">
                {paid ? (
                  <>
                    Listo. Si todo anda bien, tus tickets deberían aparecer al toque. Si no, en unos segundos:
                    webhook + reintento.
                  </>
                ) : (
                  <>
                    Todavía no está “paid”. Si estabas en 3DS y lo cancelaste, esto queda pendiente (y tu banco
                    feliz porque no cobró).
                  </>
                )}
              </p>

              {eventTitle ? (
                <p className="mt-3 text-sm text-white/80">
                  Evento: <span className="text-white font-semibold">{eventTitle}</span>
                </p>
              ) : null}

              {buyerEmail ? (
                <p className="mt-1 text-sm text-white/70">
                  Email: <span className="text-white">{buyerEmail}</span>
                </p>
              ) : (
                <p className="mt-1 text-sm text-white/60">
                  No pude leer tu email aquí. Igual puedes ir a Mis tickets y filtrarlo.
                </p>
              )}
            </div>
          </div>

          <div className="mt-6 flex flex-wrap gap-2">
            <Link
              href={misTicketsHref}
              className="inline-flex items-center justify-center rounded-xl bg-white px-4 py-2 text-sm font-semibold text-black hover:bg-white/90"
            >
              Ver mis tickets
            </Link>

            <Link
              href="/eventos"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Volver a eventos
            </Link>

            <Link
              href="/organizador"
              className="inline-flex items-center justify-center rounded-xl border border-white/10 bg-white/5 px-4 py-2 text-sm hover:bg-white/10"
            >
              Ir al organizador
            </Link>
          </div>

          <div className="mt-6">
            <SuccessClient
              paid={paid}
              misTicketsHref={misTicketsHref}
              sessionId={sessionId}
              buyerEmail={buyerEmail}
            />
          </div>

          <details className="mt-6 rounded-2xl border border-white/10 bg-black/10 p-4">
            <summary className="cursor-pointer text-sm text-white/70">Detalle técnico</summary>
            <div className="mt-3 space-y-2 text-xs text-white/60">
              <div className="flex flex-wrap gap-2">
                <span className="text-white/40">session_id:</span>
                <span className="text-white/80 break-all">{sessionId}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-white/40">paymentId:</span>
                <span className="text-white/80 break-all">{paymentId || "-"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-white/40">holdId:</span>
                <span className="text-white/80 break-all">{holdId || "-"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-white/40">orderId:</span>
                <span className="text-white/80 break-all">{orderId || "-"}</span>
              </div>
              <div className="flex flex-wrap gap-2">
                <span className="text-white/40">status:</span>
                <span className="text-white/80 break-all">{paymentStatus || (paid ? "paid" : "-")}</span>
              </div>
            </div>
          </details>

          <p className="mt-6 text-xs text-white/40">
            Nota: webhook sigue siendo el plan A. Esto solo “acelera” cuando el usuario vuelve desde Stripe.
          </p>
        </div>
      </div>
    </div>
  );
}
