// apps/web/src/app/api/admin/organizers/[id]/approve/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const organizerId = String(id || "").trim();

  if (!organizerId) {
    return NextResponse.json({ ok: false, error: "ID inválido." }, { status: 400 });
  }

  // ✅ Solo aprueba si ya verificó (profesional)
  const r = await pool.query(
    `
    UPDATE organizer_users
    SET approved = true
    WHERE id = $1
      AND verified = true
    RETURNING id, approved
    `,
    [organizerId]
  );

  if (r.rowCount === 0) {
    // Puede ser: no existe, o existe pero no verified
    const check = await pool.query(
      `SELECT id, verified, approved FROM organizer_users WHERE id = $1 LIMIT 1`,
      [organizerId]
    );

    if (check.rowCount === 0) {
      return NextResponse.json({ ok: false, error: "Organizador no existe." }, { status: 404 });
    }

    const row = check.rows[0];
    if (!row.verified) {
      return NextResponse.json(
        { ok: false, error: "No se puede aprobar: organizador aún no verifica su correo." },
        { status: 409 }
      );
    }

    // Si ya estaba aprobado, lo dejamos idempotente
    if (row.approved) return NextResponse.json({ ok: true });

    return NextResponse.json({ ok: false, error: "No se pudo aprobar." }, { status: 400 });
  }

  return NextResponse.json({ ok: true });
}