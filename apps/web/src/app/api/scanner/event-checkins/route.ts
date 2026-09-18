import { eventCheckins } from "@/lib/scanner-read.server";
import { accessResponse, privateJson } from "@/lib/access.server";
export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try {
    const data = await eventCheckins(new URL(request.url).searchParams.get("eventId") || "");
    return privateJson(200, { ok: true, checkins: data });
  } catch (error) { return accessResponse(error); }
}
