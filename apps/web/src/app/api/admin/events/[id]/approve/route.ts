// apps/web/src/app/api/admin/events/[id]/approve/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/db";
import crypto from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function slugify(input: string) {
  return String(input || "")
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 80);
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function pickInt(v: any) {
  const n = Number(v);
  return Number.isFinite(n) ? Math.floor(n) : 0;
}

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const submissionId = String(id || "").trim();

  if (!submissionId) {
    return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const subRes = await client.query<{
      id: string;
      organizer_id: string;
      status: string;
      payload: any;
      created_at: Date;
    }>(
      `
      SELECT id, organizer_id, status, payload, created_at
      FROM organizer_event_submissions
      WHERE id = $1
      LIMIT 1
      `,
      [submissionId]
    );

    const sub = subRes.rows?.[0];
    if (!sub) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Solicitud no existe." }, { status: 404 });
    }

    const status = String(sub.status || "").toUpperCase();
    if (status === "APPROVED") {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: true, alreadyApproved: true });
    }

    if (status !== "IN_REVIEW") {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { ok: false, error: `La solicitud no está en revisión (status=${status}).` },
        { status: 409 }
      );
    }

    const payload = sub.payload && typeof sub.payload === "object" ? sub.payload : {};

    const title = pickString(payload.title);
    const city = pickString(payload.city);
    const venue = pickString(payload.venue);
    const dateISO = pickString(payload.dateISO);
    const image = pickString(payload.image);
    const description = pickString(payload.description);

    const ticketName = pickString(payload.ticketType?.name) || "General";
    const ticketPrice = pickInt(payload.ticketType?.priceClp);
    const ticketCapacity = pickInt(payload.ticketType?.capacity);

    if (!title || !city || !venue || !dateISO || !description) {
      await client.query("ROLLBACK");
      return NextResponse.json(
        { ok: false, error: "La solicitud no tiene payload válido." },
        { status: 400 }
      );
    }

    const organizerId = String(sub.organizer_id);
    const eventId = "evt_" + crypto.randomBytes(12).toString("hex");
    const ticketTypeId = "tt_" + crypto.randomBytes(12).toString("hex");

    let slugBase = slugify(title);
    if (!slugBase) slugBase = "evento";

    let slug = slugBase;
    let i = 2;

    // asegurar slug único
    for (;;) {
      const exists = await client.query(
        `SELECT 1 FROM events WHERE slug = $1 LIMIT 1`,
        [slug]
      );
      if (exists.rowCount === 0) break;
      slug = `${slugBase}-${i++}`;
    }

    await client.query(
      `
      INSERT INTO events
        (id, slug, title, city, venue, date_iso, description, image, is_published)
      VALUES
        ($1, $2, $3, $4, $5, $6, $7, $8, true)
      `,
      [eventId, slug, title, city, venue, dateISO, description, image || null]
    );

    await client.query(
      `
      INSERT INTO organizer_events (organizer_id, event_id)
      VALUES ($1, $2)
      `,
      [organizerId, eventId]
    );

    await client.query(
      `
      INSERT INTO ticket_types
        (id, event_id, name, price_clp, capacity, sold, held)
      VALUES
        ($1, $2, $3, $4, $5, 0, 0)
      `,
      [ticketTypeId, eventId, ticketName, ticketPrice, ticketCapacity]
    );

    await client.query(
      `
      UPDATE organizer_event_submissions
      SET status = 'APPROVED'
      WHERE id = $1
      `,
      [submissionId]
    );

    await client.query("COMMIT");

    return NextResponse.json({
      ok: true,
      eventId,
      submissionId,
      slug,
    });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    return NextResponse.json(
      { ok: false, error: e?.message || "No se pudo aprobar la solicitud." },
      { status: 500 }
    );
  } finally {
    client.release();
  }
}