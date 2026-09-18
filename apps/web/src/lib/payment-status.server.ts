import "server-only";
import { withTx } from "@/lib/db";
import { stripe } from "@/lib/stripe.server";
import { finalizePaidHoldToOrderPgTx } from "@/lib/checkout.pg.server";
import { ownedPayment, PAYMENT_OWNER_SQL, type PaymentRow } from "@/lib/payment-access.server";
import { TICKET_OWNER_SQL } from "@/lib/buyer-guard.server";
import { AccessError } from "@/lib/access.server";
import { deliverPaidOrder } from "@/lib/paid-ticket-delivery.server";

export async function buyerPaymentStatus(email: string, reference: Parameters<typeof ownedPayment>[1], reconcileStripe = false) {
  // Deny foreign IDs before provider calls or transaction/finalization work.
  const owned = await ownedPayment(email, reference);
  const snapshot = await withTx(async client => {
    const result = await client.query<PaymentRow>(
      `SELECT * FROM payments WHERE id=$1 AND ${PAYMENT_OWNER_SQL}=$2 FOR UPDATE`, [owned.id, email],
    );
    const payment = result.rows[0];
    if (!payment) throw new AccessError(404, "NOT_FOUND", "Pago no encontrado.");
    if (reconcileStripe && payment.provider === "stripe" && payment.status !== "PAID" && payment.provider_ref) {
      const session = await stripe.checkout.sessions.retrieve(payment.provider_ref);
      if (session.id !== payment.provider_ref || session.amount_total !== Number(payment.amount_clp) ||
          session.currency?.toUpperCase() !== payment.currency.toUpperCase() ||
          (session.metadata?.paymentId && session.metadata.paymentId !== payment.id)) {
        throw new AccessError(409, "PAYMENT_MISMATCH", "No se pudo verificar el pago.");
      }
      if (session.payment_status === "paid") {
        await client.query(`UPDATE payments SET status='PAID', paid_at=COALESCE(paid_at,NOW()), updated_at=NOW() WHERE id=$1`, [payment.id]);
        payment.status = "PAID";
      }
    }
    let orderId = payment.order_id || "";
    if (payment.status === "PAID") {
      const order = await client.query<{ id: string }>(`SELECT id FROM orders WHERE hold_id=$1`, [payment.hold_id]);
      orderId = order.rows[0]?.id || orderId;
      if (!orderId) {
        await finalizePaidHoldToOrderPgTx(client, { holdId: payment.hold_id, eventTitle: payment.event_title,
          buyerName: payment.buyer_name, buyerEmail: payment.buyer_email, paymentId: payment.id });
        const finalized = await client.query<{ id: string }>(`SELECT id FROM orders WHERE hold_id=$1`, [payment.hold_id]);
        orderId = finalized.rows[0]?.id || "";
      }
    }
    const tickets = orderId ? await client.query(
      `SELECT t.id, t.order_id AS "orderId", t.event_id AS "eventId", t.ticket_type_name AS "ticketTypeName",
              t.status, t.created_at AS "createdAtISO"
       FROM tickets t JOIN orders o ON o.id=t.order_id
       WHERE o.id=$1 AND ${TICKET_OWNER_SQL}=$2 ORDER BY t.created_at ASC`, [orderId, email],
    ) : { rows: [] };
    return { ok: true, payment: { id: payment.id, holdId: payment.hold_id, orderId,
      provider: payment.provider, status: payment.status, buyerName: payment.buyer_name,
      buyerEmail: payment.buyer_email, eventTitle: payment.event_title, amountClp: payment.amount_clp }, tickets: tickets.rows };
  });
  if (snapshot.payment.status === "PAID" && snapshot.payment.orderId) {
    // Email availability must not turn a verified paid status into a failure.
    await deliverPaidOrder(snapshot.payment.orderId).catch(() => undefined);
  }
  return snapshot;
}
