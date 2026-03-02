// apps/web/src/app/api/organizador/verify/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

async function readBody(req: NextRequest): Promise<Record<string, any>> {
  const ct = String(req.headers.get("content-type") || "").toLowerCase();
  if (ct.includes("application/json")) return (await req.json().catch(() => ({}))) as any;

  if (ct.includes("application/x-www-form-urlencoded") || ct.includes("multipart/form-data")) {
    const fd = await req.formData().catch(() => null);
    if (!fd) return {};
    const obj: Record<string, any> = {};
    for (const [k, v] of fd.entries()) obj[k] = v;
    return obj;
  }

  return (await req.json().catch(() => ({}))) as any;
}

export async function POST(req: NextRequest) {
  const body = await readBody(req);

  const organizerId = String(body.organizerId || "").trim();
  const code = String(body.code || "").trim();

  if (!organizerId || !code) {
    return NextResponse.json({ ok: false, error: "Falta organizerId o código." }, { status: 400 });
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `
      SELECT id
      FROM organizer_verifications
      WHERE organizer_id = $1
        AND code = $2
        AND used = false
        AND expires_at > NOW()
      ORDER BY created_at DESC
      LIMIT 1
      `,
      [organizerId, code]
    );

    if (!r.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Código inválido o expirado." }, { status: 401 });
    }

    const verId = String(r.rows[0].id);

    await client.query(
      `UPDATE organizer_verifications SET used = true WHERE id = $1`,
      [verId]
    );

    await client.query(
      `UPDATE organizer_users SET verified = true WHERE id = $1`,
      [organizerId]
    );

    await client.query("COMMIT");
    return NextResponse.json({ ok: true });
  } catch (e: any) {
    try { await client.query("ROLLBACK"); } catch {}
    return NextResponse.json({ ok: false, error: e?.message || "Error verificando." }, { status: 500 });
  } finally {
    client.release();
  }
}