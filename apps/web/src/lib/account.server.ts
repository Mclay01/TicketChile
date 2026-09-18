import "server-only";
import { pool } from "@/lib/db";
import { requireBuyerEmail } from "@/lib/ticket-access.server";
import { TICKET_OWNER_SQL } from "@/lib/buyer-guard.server";
import { identifier } from "@/lib/access.server";
import { mediaSource, eventMedia, MEDIA_FALLBACK } from "@/lib/media";
import { redirect } from "next/navigation";
import { AccessError } from "@/lib/access.server";
async function accountEmail() {
  try { return await requireBuyerEmail(); }
  catch (error) { if (error instanceof AccessError && error.status === 401) redirect("/signin?callbackUrl=/cuenta"); throw error; }
}
export async function buyerProfile() {
  const email = await accountEmail();
  const result = await pool.query<{ nombre: string; email: string; email_verified_at: Date | null }>(`SELECT nombre,email,email_verified_at FROM usuarios WHERE lower(email)=$1 LIMIT 1`, [email]);
  return result.rows[0] || null;
}
export type AccountTicket = { id: string; status: string; ticket_type_name: string; title: string; date_iso: Date; city: string; venue: string; image: string; owner_email: string; slug: string; event_id: string; is_published: boolean };
const ticketSelect = `SELECT t.id,t.status,t.ticket_type_name,e.id AS event_id,e.is_published,e.title,e.date_iso,e.city,e.venue,e.image,e.slug,${TICKET_OWNER_SQL} AS owner_email
 FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=t.event_id`;
const ticketImage = (t: AccountTicket) => t.image.startsWith("data:") ? t.is_published ? eventMedia(t.image, t.event_id) : MEDIA_FALLBACK : mediaSource(t.image);
export async function buyerTickets(view = "upcoming", page = 1) {
  const email = await accountEmail();
  const condition = view === "cancelled" ? "t.status='CANCELLED'" : view === "past" ? "t.status<>'CANCELLED' AND e.date_iso<now()" : "t.status<>'CANCELLED' AND e.date_iso>=now()";
  const result = await pool.query<AccountTicket>(`${ticketSelect} WHERE ${TICKET_OWNER_SQL}=$1 AND ${condition} ORDER BY e.date_iso,t.id LIMIT 13 OFFSET $2`, [email, (Math.min(1000, Math.max(1, page)) - 1) * 12]);
  return { tickets: result.rows.slice(0, 12).map(t => ({ ...t, image: ticketImage(t) })), hasMore: result.rows.length > 12 };
}
export async function buyerTicket(id: string) {
  const email = await accountEmail();
  if (!identifier(id)) return null;
  const result = await pool.query<AccountTicket>(`${ticketSelect} WHERE t.id=$1 AND ${TICKET_OWNER_SQL}=$2 LIMIT 1`, [id, email]);
  const row = result.rows[0];
  return row ? { ...row, image: ticketImage(row) } : null;
}
export type Purchase = { id: string; event_title: string; created_at: Date; amount_clp: number | null; status: string | null; fulfillment_status: string | null };
export async function buyerPurchases(page = 1) {
  const email = await accountEmail();
  const result = await pool.query<Purchase>(`SELECT o.id,o.event_title,o.created_at,p.amount_clp,p.status,p.fulfillment_status FROM orders o
    LEFT JOIN payments p ON p.order_id=o.id AND lower(COALESCE(NULLIF(BTRIM(p.owner_email),''),p.buyer_email))=$1
    WHERE lower(COALESCE(NULLIF(BTRIM(o.owner_email),''),o.buyer_email))=$1 ORDER BY o.created_at DESC,o.id LIMIT 13 OFFSET $2`, [email, (Math.min(1000, Math.max(1, page)) - 1) * 12]);
  return { purchases: result.rows.slice(0, 12), hasMore: result.rows.length > 12 };
}
export function walletAvailable() { return ["GOOGLE_WALLET_ISSUER_ID", "GOOGLE_WALLET_SERVICE_ACCOUNT_EMAIL", "GOOGLE_WALLET_PRIVATE_KEY", "APP_BASE_URL"].every(key => Boolean(process.env[key]?.trim())); }
