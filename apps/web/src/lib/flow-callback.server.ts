import "server-only";
import { flowVerifyWebhookSignature } from "@/lib/flow";
import { reconcileFlow } from "@/lib/flow-reconcile.server";
import { AccessError, accessResponse } from "@/lib/access.server";
export async function flowCallback(req: Request) {
  try {
    const params = req.method === "GET" ? new URL(req.url).searchParams : new URLSearchParams(await req.text());
    const fields = Object.fromEntries(params);
    if (fields.s && !flowVerifyWebhookSignature(fields)) throw new AccessError(403, "FORBIDDEN", "Firma invalida.");
    // Independently verify the stored transaction; never return buyer data.
    await reconcileFlow(fields.token || "");
    return new Response("OK", { headers: { "Cache-Control": "no-store" } });
  } catch (error) { return accessResponse(error); }
}
