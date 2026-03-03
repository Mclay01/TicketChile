// apps/web/src/app/api/organizador/eventos/submit/route.ts
import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import crypto from "crypto";
import { requireOrganizerApproved } from "@/lib/organizer-guard.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function pickInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

function reasonToMessage(reason: "missing" | "invalid" | "unverified" | "pending") {
  if (reason === "missing" || reason === "invalid") return "No autorizado.";
  if (reason === "unverified") return "Debes verificar tu correo antes de crear eventos.";
  return "Tu cuenta está pendiente de aprobación por el admin.";
}

export async function POST(req: Request) {
  // ✅ Gate real: sesión + DB + verified + approved
  const gate = await requireOrganizerApproved();
  if (!gate.ok) {
    return NextResponse.json(
      { ok: false, error: reasonToMessage(gate.reason), reason: gate.reason },
      { status: gate.status }
    );
  }

  const organizerId = gate.organizerId;

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

  // validaciones mínimas
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

  // redirect simple a /organizador (después haremos /organizador/revision)
  return new NextResponse(null, { status: 303, headers: { Location: "/organizador" } });
}