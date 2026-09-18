import "server-only";
import type { PoolClient } from "pg";
import { requireBuyerEmail } from "@/lib/ticket-access.server";
import { AccessError, requireSameOrigin } from "@/lib/access.server";

export async function paymentCreator(req: Request) {
  requireSameOrigin(req);
  return requireBuyerEmail();
}

/** Call while holding the hold row lock. A pending inventory hold may be
 * claimed once, but an existing payment can never change owners/providers. */
export async function checkPaymentRetry(client: PoolClient, holdId: string, email: string, provider: string) {
  const result = await client.query<{ owner_email: string; buyer_email: string; provider: string }>(
    `SELECT owner_email, buyer_email, provider FROM payments WHERE hold_id=$1 FOR UPDATE`, [holdId],
  );
  const payment = result.rows[0];
  if (payment && ((payment.owner_email?.trim() || payment.buyer_email?.trim() || "").toLowerCase() !== email || payment.provider !== provider)) {
    throw new AccessError(404, "NOT_FOUND", "Pago no encontrado.");
  }
}
