import type { NextRequest } from "next/server";
import { GET as availabilityGET } from "../availability/route";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: NextRequest) {
  // availabilityGET está tipado como (req: Request) en tu otro route,
  // así que lo adaptamos sin re-exportar config (que es lo que Next odia).
  return availabilityGET(req as unknown as Request);
}
