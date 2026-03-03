// apps/web/src/app/api/organizador/eventos/submit/route.ts
import { NextResponse } from "next/server";
import { cookies } from "next/headers";
import { pool } from "@/lib/db";
import crypto from "crypto";
import { getOrganizerFromSession } from "@/lib/organizer-auth.pg.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function pickInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

export async function POST(req: Request) {
  const ck = await cookies();

  // ✅ ÚNICA fuente de verdad: sesión DB
  const sid =
    ck.get("tc_org_sess")?.value ??
    ck.get("organizer_session")?.value ??
    ck.get("tc_org_session")?.value ??
    "";

  const organizer = sid ? await getOrganizerFromSession(sid) : null;
  const organizerId = organizer?.id ?? null;

  if (!organizerId) {
    return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  }

  // ✅ Gate: verificado + aprobado (misma regla que login/dashboard)
  const gate = await pool.query<{ verified: boolean; approved: boolean }>(
    `SELECT verified, approved FROM organizer_users WHERE id = $1 LIMIT 1`,
    [organizerId]
  );

  const row = gate.rows?.[0];
  if (!row) return NextResponse.json({ ok: false, error: "No autorizado." }, { status: 401 });
  if (!row.verified) return NextResponse.json({ ok: false, error: "Debes verificar tu correo primero." }, { status: 403 });
  if (!row.approved) return NextResponse.json({ ok: false, error: "Tu cuenta está pendiente de aprobación." }, { status: 403 });

  const fd = await req.formData();

  const payload = {
    title: pickString(fd.get("title")),
    city: pickString(fd.get("city")),
    venue: pickString(fd.get("venue")),
    dateISO: pickString(fd.get("dateISO")),
    image: pickString(fd.get("image")),
    description: pickString(fd.get("description")),
    ticketType: {
      name: pickString(fd.get("tt_name")),
      priceClp: pickInt(fd.get("tt_price")),
      capacity: pickInt(fd.get("tt_capacity")),
    },
  };

  if (!payload.title || !payload.city || !payload.venue || !payload.dateISO || !payload.description) {
    return NextResponse.json({ ok: false, error: "Faltan campos requeridos." }, { status: 400 });
  }

  const id = "sub_" + crypto.randomBytes(12).toString("hex");

  await pool.query(
    `
    INSERT INTO organizer_event_submissions (id, organizer_id, status, payload)
    VALUES ($1, $2, 'IN_REVIEW', $3::jsonb)
    `,
    [id, organizerId, JSON.stringify(payload)]
  );

  return new NextResponse(null, { status: 303, headers: { Location: "/organizador" } });
}