import { NextResponse } from "next/server";
import { randomUUID } from "node:crypto";
import { withTx } from "@/lib/db";
import { flowGetStatus } from "@/lib/flow";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

async function readFormToken(req: Request) {
  const raw = await req.text();
  const sp = new URLSearchParams(raw);
  return pickString(sp.get("token"));
}

export async function POST(req: Request) {
  try {
    const token = await readFormToken(req);
    const paymentIdFromQuery = new URL(req.url).searchParams.get("payment_id") || "";

    if (!token) return NextResponse.json({ ok: false, error: "Falta token" }, { status: 400 });

    // Dedupe webhook por (provider, event_id=token)
    const inserted = await withTx(async (db) => {
      const r = await db.query(
        `
        INSERT INTO webhook_events (provider, event_id)
        VALUES ('flow', $1)
        ON CONFLICT DO NOTHING
        RETURNING provider
        `,
        [token]
      );
      return r.rowCount === 1;
    });

    if (!inserted) {
      // Ya procesado: responde 200 rápido (Flow no necesita nada más)
      return NextResponse.json({ ok: true, deduped: true });
    }

    const st = await flowGetStatus(token);

    // status: 1 pending, 2 paid, 3 rejected, 4 cancelled
    if (Number(st.status) !== 2) {
      // Actualiza estado y, si falló/anuló, libera la reserva (held)
      await withTx(async (db) => {
        const commerceOrder = String(st.commerceOrder || paymentIdFromQuery || "");

        // bloquear payment
        const p = await db.query(`SELECT * FROM payments WHERE id = $1 FOR UPDATE`, [
          commerceOrder,
        ]);

        const pay = p.rows[0];
        if (!pay) return;

        const newStatus =
          st.status === 1 ? "PENDING" : st.status === 3 ? "FAILED" : "CANCELLED";

        await db.query(
          `UPDATE payments SET status = $2, updated_at = NOW() WHERE id = $1`,
          [commerceOrder, newStatus]
        );

        if (st.status === 3 || st.status === 4) {
          // libera hold
          const holdId = String(pay.hold_id);
          const hi = await db.query(
            `SELECT event_id, ticket_type_id, qty FROM hold_items WHERE hold_id = $1`,
            [holdId]
          );

          for (const row of hi.rows) {
            await db.query(
              `
              UPDATE ticket_types
              SET held = GREATEST(held - $3, 0)
              WHERE event_id = $1 AND id = $2
              `,
              [String(row.event_id), String(row.ticket_type_id), Number(row.qty)]
            );
          }

          await db.query(
            `UPDATE holds SET status = 'EXPIRED' WHERE id = $1 AND status = 'ACTIVE'`,
            [holdId]
          );
        }
      });

      return NextResponse.json({ ok: true, status: st.status });
    }

    // PAID => finalizar (idempotente por locks)
    await withTx(async (db) => {
      const commerceOrder = String(st.commerceOrder || paymentIdFromQuery || "");
      if (!commerceOrder) throw new Error("No tengo commerceOrder para mapear pago.");

      const p = await db.query(`SELECT * FROM payments WHERE id = $1 FOR UPDATE`, [
        commerceOrder,
      ]);
      const pay = p.rows[0];
      if (!pay) throw new Error("Pago no existe en DB.");

      if (String(pay.status) === "PAID" && pay.order_id) {
        return; // ya finalizado
      }

      const holdId = String(pay.hold_id);

      const h = await db.query(`SELECT * FROM holds WHERE id = $1 FOR UPDATE`, [holdId]);
      const hold = h.rows[0];
      if (!hold) throw new Error("Hold no existe.");

      const items = await db.query(
        `SELECT * FROM hold_items WHERE hold_id = $1 ORDER BY ticket_type_id`,
        [holdId]
      );

      // mover held->sold
      for (const it of items.rows) {
        await db.query(
          `
          UPDATE ticket_types
          SET
            held = GREATEST(held - $3, 0),
            sold = sold + $3
          WHERE event_id = $1 AND id = $2
          `,
          [String(it.event_id), String(it.ticket_type_id), Number(it.qty)]
        );
      }

      // hold consumido
      await db.query(`UPDATE holds SET status = 'CONSUMED' WHERE id = $1`, [holdId]);

      // crear order
      const orderId = `ord_${randomUUID()}`;
      await db.query(
        `
        INSERT INTO orders
          (id, hold_id, event_id, event_title, buyer_name, buyer_email, owner_email)
        VALUES
          ($1, $2, $3, $4, $5, $6, $7)
        `,
        [
          orderId,
          holdId,
          String(pay.event_id),
          String(pay.event_title),
          String(pay.buyer_name),
          String(pay.buyer_email),
          String(pay.owner_email),
        ]
      );

      // crear tickets (uno por unidad)
      for (const it of items.rows) {
        const qty = Number(it.qty);
        for (let i = 0; i < qty; i++) {
          const ticketId = `tkt_${randomUUID()}`;
          await db.query(
            `
            INSERT INTO tickets
              (id, order_id, event_id, ticket_type_id, ticket_type_name,
               buyer_email, owner_email, status)
            VALUES
              ($1, $2, $3, $4, $5, $6, $7, 'VALID')
            `,
            [
              ticketId,
              orderId,
              String(pay.event_id),
              String(it.ticket_type_id),
              String(it.ticket_type_name),
              String(pay.buyer_email),
              String(pay.owner_email),
            ]
          );
        }
      }

      // payment PAID
      await db.query(
        `
        UPDATE payments
        SET status = 'PAID', paid_at = NOW(), order_id = $2, updated_at = NOW()
        WHERE id = $1
        `,
        [commerceOrder, orderId]
      );
    });

    return NextResponse.json({ ok: true, paid: true });
  } catch (e: any) {
    // Importante: Flow recomienda responder 200 rápido, pero si tu server falla aquí,
    // Flow reintenta. Mantén logs y corrige.
    const msg = String(e?.message || e);
    return NextResponse.json({ ok: false, error: msg }, { status: 200 });
  }
}
