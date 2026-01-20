import { NextResponse } from "next/server";
import crypto from "node:crypto";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const token = String(url.searchParams.get("token") ?? "").trim();

  const redirectOk = new URL("/signin?verified=1", url);
  const redirectBad = new URL("/signin?verified=0", url);

  if (!token) return NextResponse.redirect(redirectBad, { headers: { "Cache-Control": "no-store" } });

  const tokenHash = sha256Hex(token);

  const r = await pool.query(
    `SELECT user_id, expires_at
     FROM email_verification_tokens
     WHERE token_hash = $1
     LIMIT 1`,
    [tokenHash]
  );

  if (r.rowCount === 0) return NextResponse.redirect(redirectBad, { headers: { "Cache-Control": "no-store" } });

  const { user_id, expires_at } = r.rows[0];
  if (new Date(expires_at).getTime() < Date.now()) return NextResponse.redirect(redirectBad, { headers: { "Cache-Control": "no-store" } });

  await pool.query(`UPDATE users SET email_verified_at = NOW() WHERE id = $1`, [user_id]);
  await pool.query(`DELETE FROM email_verification_tokens WHERE user_id = $1`, [user_id]);

  return NextResponse.redirect(redirectOk, { headers: { "Cache-Control": "no-store" } });
}
