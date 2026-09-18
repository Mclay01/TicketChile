import "server-only";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";

export async function getBuyerEmail(): Promise<string | null> {
  const session = await getServerSession(authOptions);
  const email = session?.user?.email?.trim().toLowerCase();
  return email || null;
}

// Fixed SQL fragment; callers use tickets AS t and orders AS o.
// A ticket owner takes precedence over the original order/buyer after transfer.
export const TICKET_OWNER_SQL = `LOWER(COALESCE(
  NULLIF(BTRIM(t.owner_email), ''), NULLIF(BTRIM(o.owner_email), ''),
  NULLIF(BTRIM(o.buyer_email), ''), NULLIF(BTRIM(t.buyer_email), '')
))`;
