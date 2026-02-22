// apps/web/src/app/api/auth/verify-email/route.ts
import { NextRequest, NextResponse } from "next/server";
import crypto from "node:crypto";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeBaseUrl(u: string) {
  return String(u || "").replace(/\/+$/, "");
}

function getOrigin(req: NextRequest) {
  const env = normalizeBaseUrl(process.env.NEXT_PUBLIC_APP_URL || process.env.APP_URL || "");
  if (env) return env;

  const proto = req.headers.get("x-forwarded-proto") || "http";
  const host = req.headers.get("x-forwarded-host") || req.headers.get("host") || "";
  if (host) return `${proto}://${host}`;

  return "http://localhost:3000";
}

export async function GET(req: NextRequest) {
  const origin = getOrigin(req);

  const token = pickString(req.nextUrl.searchParams.get("token"));
  const redirectOk = new URL("/signin?verified=1", origin);
  const redirectBad = new URL("/signin?verified=0", origin);

  if (!token) {
    return NextResponse.redirect(redirectBad, { headers: { "Cache-Control": "no-store" } });
  }

  const tokenHash = sha256Hex(token);

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    const r = await client.query(
      `
      SELECT user_id, expires_at
      FROM email_verification_tokens
      WHERE token_hash = $1
      LIMIT 1
      FOR UPDATE
      `,
      [tokenHash]
    );

    if ((r.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.redirect(redirectBad, { headers: { "Cache-Control": "no-store" } });
    }

    const userId = String(r.rows[0].user_id);
    const expiresAt = r.rows[0].expires_at ? new Date(r.rows[0].expires_at) : null;

    if (!expiresAt || Number.isNaN(expiresAt.getTime()) || expiresAt.getTime() < Date.now()) {
      // Token expirado => lo borramos para evitar basura
      await client.query(`DELETE FROM email_verification_tokens WHERE token_hash = $1`, [tokenHash]);
      await client.query("COMMIT");
      return NextResponse.redirect(redirectBad, { headers: { "Cache-Control": "no-store" } });
    }

    // ✅ Tabla real: usuarios (uuid)
    const u = await client.query(
      `
      UPDATE usuarios
         SET email_verified_at = NOW(),
             updated_at = NOW()
       WHERE id = $1
       RETURNING id
      `,
      [userId]
    );

    if ((u.rowCount ?? 0) === 0) {
      await client.query("ROLLBACK");
      return NextResponse.redirect(redirectBad, { headers: { "Cache-Control": "no-store" } });
    }

    await client.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [userId]);

    await client.query("COMMIT");

    return NextResponse.redirect(redirectOk, { headers: { "Cache-Control": "no-store" } });
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    // Si algo revienta, mejor mandarlo a verified=0 y no mostrar pantalla 500 al usuario final
    return NextResponse.redirect(
      new URL(`/signin?verified=0&reason=server_error`, origin),
      { headers: { "Cache-Control": "no-store" } }
    );
  } finally {
    client.release();
  }
}