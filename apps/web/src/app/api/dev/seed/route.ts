import { NextResponse } from "next/server";
import { seedFromEvents } from "@/lib/seed.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST() {
  if (process.env.NODE_ENV === "production") {
    return NextResponse.json({ ok: false, error: "No permitido." }, { status: 403 });
  }
  await seedFromEvents();
  return NextResponse.json({ ok: true });
}
