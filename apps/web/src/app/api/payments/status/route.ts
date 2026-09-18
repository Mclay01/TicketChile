import { requireBuyerEmail } from "@/lib/ticket-access.server";
import { buyerPaymentStatus } from "@/lib/payment-status.server";
import { accessResponse, privateJson } from "@/lib/access.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(req: Request) {
  try {
    const email = await requireBuyerEmail();
    const params = new URL(req.url).searchParams;
    return privateJson(200, await buyerPaymentStatus(email, { id: params.get("payment_id") || "" }, false));
  } catch (error) { return accessResponse(error); }
}
