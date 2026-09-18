import "server-only";
import type { PoolClient } from "pg";
import { requireBuyerEmail } from "@/lib/ticket-access.server";
import { AccessError, requireSameOrigin } from "@/lib/access.server";
import { publicLimit } from "@/lib/security/rate-limit.server";
import { requireHoldOwner } from "@/lib/security/holds.server";

export async function paymentCreator(req: Request) {
  requireSameOrigin(req);
  const email=await requireBuyerEmail();
  await publicLimit(req,"checkout",email,{hits:20,seconds:900});
  return email;
}

/** Call while holding the hold row lock. A pending inventory hold may be
 * claimed once, but an existing payment can never change owners/providers. */
export async function checkPaymentRetry(client: PoolClient, holdId: string, email: string, provider: string) {
  await requireHoldOwner(client,holdId,email);
  const result = await client.query<{ owner_email: string; buyer_email: string; provider: string }>(
    `SELECT owner_email, buyer_email, provider FROM payments WHERE hold_id=$1 FOR UPDATE`, [holdId],
  );
  const payment = result.rows[0];
  if (payment && ((payment.owner_email?.trim() || payment.buyer_email?.trim() || "").toLowerCase() !== email || payment.provider !== provider)) {
    throw new AccessError(404, "NOT_FOUND", "Pago no encontrado.");
  }
}
