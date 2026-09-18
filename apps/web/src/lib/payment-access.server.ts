import "server-only";
import { pool } from "@/lib/db";
import { AccessError, identifier } from "@/lib/access.server";

export const PAYMENT_OWNER_SQL = "LOWER(COALESCE(NULLIF(BTRIM(owner_email), ''), NULLIF(BTRIM(buyer_email), '')))";
export type PaymentRow = {
  id: string; hold_id: string; order_id: string | null; event_id: string;
  provider: string; provider_ref: string | null; status: string;
  owner_email: string; buyer_email: string; buyer_name: string; event_title: string;
  amount_clp: number; currency: string;
};
export async function ownedPayment(email: string, reference: { id?: string; provider?: "stripe" | "flow"; token?: string }) {
  if (!email || (!reference.id && !reference.token) || (reference.id && !identifier(reference.id)) || (reference.token && reference.token.length > 512)) {
    throw new AccessError(400, "INVALID_INPUT", "Pago inválido.");
  }
  const result = await pool.query<PaymentRow>(
    `SELECT * FROM payments WHERE ${PAYMENT_OWNER_SQL}=$1
       AND ($2::text IS NULL OR id=$2) AND ($3::text IS NULL OR provider=$3)
       AND ($4::text IS NULL OR provider_ref=$4) LIMIT 1`,
    [email, reference.id ?? null, reference.provider ?? null, reference.token ?? null],
  );
  const payment = result.rows[0];
  if (!payment) throw new AccessError(404, "NOT_FOUND", "Pago no encontrado.");
  return payment;
}
