// apps/web/src/app/api/organizador/register/route.ts
import { NextResponse, type NextRequest } from "next/server";
import { pool } from "@/lib/db";
import { hashPassword } from "@/lib/organizer-auth.pg.server";
import { randomBytes } from "crypto";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(obj: any, keys: string[]) {
  for (const k of keys) {
    const v = obj?.[k];
    if (typeof v === "string" && v.trim()) return v.trim();
  }
  return "";
}

function code6() {
  return String(Math.floor(100000 + Math.random() * 900000));
}

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

  // Datos del carrusel (mínimo viable)
  const orgType = pickString(body, ["orgType", "type"]); // persona | empresa
  const legalName = pickString(body, ["legalName", "nombreLegal"]);
  const rut = pickString(body, ["rut"]);
  const displayName = pickString(body, ["displayName", "nombrePublico"]);

  const email = pickString(body, ["email"]).toLowerCase();
  const phone = pickString(body, ["phone", "telefono"]);
  const channelRaw = pickString(body, ["channel", "verificationChannel"]); // email | whatsapp

  const username = pickString(body, ["username", "user"]).toLowerCase() || email; // default = email
  const password = pickString(body, ["password", "pass"]);

  // ✅ confirmación (si viene)
  const password2 = pickString(body, ["password2", "confirmPassword", "passwordConfirm"]);

  const channel = (channelRaw === "whatsapp" ? "whatsapp" : "email") as "email" | "whatsapp";

  if (!legalName || !rut || !email || !password) {
    return NextResponse.json({ ok: false, error: "Faltan campos requeridos." }, { status: 400 });
  }

  if (password2 && password !== password2) {
    return NextResponse.json({ ok: false, error: "Las contraseñas no coinciden." }, { status: 400 });
  }

  const destination = channel === "whatsapp" ? phone : email;
  if (!destination) {
    return NextResponse.json(
      { ok: false, error: `Falta ${channel === "whatsapp" ? "teléfono" : "email"} para verificación.` },
      { status: 400 }
    );
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // evita duplicados por username/email/phone
    const dupe = await client.query(
      `
      SELECT 1
      FROM organizer_users
      WHERE LOWER(username) = LOWER($1)
         OR (email IS NOT NULL AND LOWER(email) = LOWER($2))
         OR (phone IS NOT NULL AND phone = $3)
      LIMIT 1
      `,
      [username, email, phone || null]
    );

    if (dupe.rowCount) {
      await client.query("ROLLBACK");
      return NextResponse.json({ ok: false, error: "Ya existe un organizador con esos datos." }, { status: 409 });
    }

    const id = "org_" + randomBytes(12).toString("hex");
    const password_hash = hashPassword(password);

    await client.query(
      `
      INSERT INTO organizer_users
        (id, username, display_name, password_hash, email, phone, verified, approved, created_at)
      VALUES
        ($1, $2, $3, $4, $5, $6, false, false, NOW())
      `,
      [id, username, displayName || legalName, password_hash, email, phone || null]
    );

    const code = code6();
    const vid = "orgver_" + randomBytes(12).toString("hex");

    await client.query(
      `
      INSERT INTO organizer_verifications (id, organizer_id, channel, destination, code, expires_at, used)
      VALUES ($1, $2, $3, $4, $5, NOW() + interval '10 minutes', false)
      `,
      [vid, id, channel, destination, code]
    );

    await client.query("COMMIT");

    // ✅ enviar código (fuera de TX)
    if (channel === "email") {
      const { sendOrganizerVerificationEmail } = await import("@/lib/email.server");
      await sendOrganizerVerificationEmail({
        to: destination,
        code,
      });
    } else {
      throw new Error("WhatsApp aún no está habilitado.");
    }

    return NextResponse.json({ ok: true, organizerId: id, channel });
  } catch (e: any) {
    try {
      await client.query("ROLLBACK");
    } catch {}

    return NextResponse.json({ ok: false, error: e?.message || "Error registrando organizador." }, { status: 500 });
  } finally {
    client.release();
  }
}