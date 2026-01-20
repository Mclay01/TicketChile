import { NextResponse } from "next/server";
import { pool } from "@/lib/db";
import crypto from "node:crypto";
import { Resend } from "resend";
import { appBaseUrl } from "@/lib/stripe.server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function json(status: number, payload: any) {
  return NextResponse.json(payload, {
    status,
    headers: { "Cache-Control": "no-store" },
  });
}

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

// scrypt$<saltHex>$<hashHex>
function hashPassword(password: string) {
  const salt = crypto.randomBytes(16);
  const hash = crypto.scryptSync(password, salt, 64);
  return `scrypt$${salt.toString("hex")}$${hash.toString("hex")}`;
}

function sha256Hex(input: string) {
  return crypto.createHash("sha256").update(input).digest("hex");
}

function esc(s: string) {
  return String(s)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const email = String(body?.email ?? "").trim().toLowerCase();
    const password = String(body?.password ?? "");

    if (!email || !isEmail(email)) return json(400, { ok: false, error: "Email inválido." });
    if (password.length < 8) return json(400, { ok: false, error: "Contraseña muy corta (mín. 8)." });

    // 1) Crear usuario + token (en transacción)
    const client = await pool.connect();
    let userId = "";
    let plainToken = "";

    try {
      await client.query("BEGIN");

      const exists = await client.query(`SELECT 1 FROM users WHERE email=$1 LIMIT 1`, [email]);
      if (exists.rowCount > 0) {
        await client.query("ROLLBACK");
        return json(409, { ok: false, error: "Ese email ya está registrado." });
      }

      userId = `usr_${crypto.randomBytes(10).toString("hex")}`;
      const passwordHash = hashPassword(password);

      await client.query(
        `INSERT INTO users (id, email, password_hash, created_at)
         VALUES ($1, $2, $3, NOW())`,
        [userId, email, passwordHash]
      );

      // token plano que va en el link
      plainToken = crypto.randomBytes(32).toString("hex");
      const tokenHash = sha256Hex(plainToken);
      const expiresAt = new Date(Date.now() + 24 * 60 * 60 * 1000); // 24h

      // Tabla actual (según tu \d):
      // token_hash (PK), user_id (uniq), email, expires_at, created_at
      await client.query(
        `
        INSERT INTO email_verification_tokens (token_hash, user_id, email, expires_at, created_at)
        VALUES ($1, $2, $3, $4, NOW())
        ON CONFLICT (user_id) DO UPDATE
          SET token_hash = EXCLUDED.token_hash,
              email = EXCLUDED.email,
              expires_at = EXCLUDED.expires_at,
              created_at = NOW()
        `,
        [tokenHash, userId, email, expiresAt]
      );

      await client.query("COMMIT");
    } catch (e) {
      try {
        await client.query("ROLLBACK");
      } catch {}
      throw e;
    } finally {
      client.release();
    }

    // 2) Enviar correo (si falla, igual dejamos creado el usuario y token)
    const RESEND_API_KEY = process.env.RESEND_API_KEY?.trim() || "";
    const from = (process.env.EMAIL_FROM || "").trim();

    const base = appBaseUrl(); // usa APP_BASE_URL / envs tuyas
    const verifyUrl = `${base}/api/auth/verify-email?token=${encodeURIComponent(plainToken)}`;

    let emailSent = false;
    let emailError: string | null = null;

    if (!RESEND_API_KEY || !from) {
      emailSent = false;
      emailError = "Falta RESEND_API_KEY o EMAIL_FROM en .env.local";
    } else {
      try {
        const resend = new Resend(RESEND_API_KEY);
        await resend.emails.send({
          from,
          to: email,
          subject: "Confirma tu correo — Ticketchile",
          html: `
            <div style="font-family:ui-sans-serif,system-ui,-apple-system,Segoe UI,Roboto,Arial;line-height:1.5;color:#111">
              <h2 style="margin:0 0 10px 0">Confirma tu correo</h2>
              <p style="margin:0 0 14px 0">Hola 👋</p>
              <p style="margin:0 0 14px 0">
                Para activar tu cuenta de <b>Ticketchile</b>, confirma tu email haciendo clic aquí:
              </p>
              <p style="margin:0 0 16px 0">
                <a href="${verifyUrl}" style="display:inline-block;background:#111;color:#fff;padding:10px 14px;border-radius:10px;text-decoration:none">
                  Confirmar correo
                </a>
              </p>
              <p style="margin:0 0 10px 0;font-size:12px;color:#666">
                Si no funciona el botón, copia y pega este link:
              </p>
              <p style="margin:0 0 0 0;font-size:12px;color:#666;word-break:break-all">
                ${esc(verifyUrl)}
              </p>
            </div>
          `,
        });

        emailSent = true;
      } catch (e: any) {
        emailSent = false;
        emailError = String(e?.message || e);
      }
    }

    return json(200, { ok: true, emailSent, emailError });
  } catch (e: any) {
    return json(500, { ok: false, error: String(e?.message || e) });
  }
}
