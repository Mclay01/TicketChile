import { catalogDb, getEventByIdDb, getEventBySlugDb } from "@/lib/events.server";
import { eventWire } from "@/lib/events-api.server";
import { accessResponse, privateJson } from "@/lib/access.server";
export const dynamic = "force-dynamic";
export async function GET(request: Request) {
  try { const params = new URL(request.url).searchParams;
    if (params.has("id") || params.has("slug")) { const event = params.has("id") ? await getEventByIdDb(params.get("id")!) : await getEventBySlugDb(params.get("slug")!); return event ? privateJson(200, eventWire(event)) : privateJson(404, { error: "Evento no disponible." }); }
    return privateJson(200, (await catalogDb(Object.fromEntries(params))).events.map(eventWire));
  } catch (error) { return accessResponse(error); }
}
