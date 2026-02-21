// apps/web/src/auth.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { pool } from "@/lib/db";
import crypto from "node:crypto";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(s || "").trim().toLowerCase());
}

function safeEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Formato guardado: scrypt$<saltHex>$<hashHex>
function verifyPassword(password: string, stored: string) {
  const [alg, saltHex, hashHex] = String(stored || "").split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const got = crypto.scryptSync(password, salt, expected.length);

  return safeEqual(got, expected);
}

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

const googleClientId = (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID || "").trim();
const googleClientSecret = (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || "").trim();

async function upsertUsuarioByEmail(args: { email: string; nombre?: string }) {
  const email = String(args.email || "").trim().toLowerCase();
  const nombre = pickString(args.nombre) || "Usuario";

  if (!email || !isEmail(email)) return null;

  // 1) Buscar
  const r = await pool.query(
    `SELECT id, email, nombre
       FROM usuarios
      WHERE email = $1
      LIMIT 1`,
    [email]
  );

  // ✅ TS fix: rowCount puede ser null
  if ((r.rowCount ?? 0) > 0) {
    return {
      id: String(r.rows[0].id),
      email: String(r.rows[0].email),
      nombre: String(r.rows[0].nombre || ""),
    };
  }

  // 2) Crear (UUID real)
  const id = crypto.randomUUID();

  // Nota: tu tabla requiere updated_at NOT NULL
  await pool.query(
    `INSERT INTO usuarios (id, nombre, email, password_hash, created_at, updated_at)
     VALUES ($1, $2, $3, '', NOW(), NOW())`,
    [id, nombre, email]
  );

  return { id, email, nombre };
}

export const authOptions: NextAuthOptions = {
  secret: (process.env.NEXTAUTH_SECRET || process.env.AUTH_SECRET || "").trim(),
  session: { strategy: "jwt" },
  pages: { signIn: "/signin" },

  providers: [
    GoogleProvider({
      clientId: googleClientId,
      clientSecret: googleClientSecret,
    }),

    CredentialsProvider({
      name: "credentials",
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },
      async authorize(creds) {
        const email = String(creds?.email ?? "").trim().toLowerCase();
        const password = String(creds?.password ?? "");

        if (!email || !isEmail(email) || !password) return null;

        // ✅ Tabla real: usuarios (uuid)
        const r = await pool.query(
          `SELECT id, email, password_hash
             FROM usuarios
            WHERE email = $1
            LIMIT 1`,
          [email]
        );

        // ✅ TS fix: rowCount puede ser null
        if ((r.rowCount ?? 0) === 0) return null;

        const u = r.rows[0];

        // Debe tener password_hash (si es Google-only, es '')
        const stored = String(u.password_hash || "");
        if (!stored) return null;

        const ok = verifyPassword(password, stored);
        if (!ok) return null;

        return { id: String(u.id), email: String(u.email) };
      },
    }),
  ],

  callbacks: {
    // ✅ Aseguramos que Google también quede amarrado a tu tabla usuarios (uuid)
    async jwt({ token, user, account, profile }) {
      // Si viene credentials (authorize ya devuelve uuid)
      if (user?.id) {
        (token as any).uid = String(user.id);
      }

      // Si viene Google: user.id NO es uuid (es el "sub"). Lo reemplazamos por el uuid en DB.
      const isGoogle = account?.provider === "google";
      const email = String(token?.email || user?.email || "").trim().toLowerCase();

      if (isGoogle && email && !(token as any).uid) {
        const nombre =
          pickString((profile as any)?.name) ||
          pickString((profile as any)?.given_name) ||
          "Usuario";

        const dbUser = await upsertUsuarioByEmail({ email, nombre });
        if (dbUser?.id) (token as any).uid = dbUser.id;
      }

      return token;
    },

    async session({ session, token }) {
      if (session.user && (token as any)?.uid) {
        (session.user as any).id = (token as any).uid;
      }
      return session;
    },
  },
};