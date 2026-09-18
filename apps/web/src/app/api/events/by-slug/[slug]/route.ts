import { getEventBySlugDb } from "@/lib/events.server";
import { eventWire } from "@/lib/events-api.server";
import { accessResponse, privateJson } from "@/lib/access.server";
export const dynamic = "force-dynamic";
export async function GET(_request: Request, { params }: { params: Promise<{ slug: string }> }) {
  try { const event = await getEventBySlugDb((await params).slug); return event ? privateJson(200, eventWire(event)) : privateJson(404, { error: "Evento no disponible." }); } catch (error) { return accessResponse(error); }
}
