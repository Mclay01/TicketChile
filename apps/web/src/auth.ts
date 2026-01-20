// apps/web/src/auth.ts
import type { NextAuthOptions } from "next-auth";
import GoogleProvider from "next-auth/providers/google";
import CredentialsProvider from "next-auth/providers/credentials";
import { pool } from "@/lib/db";
import crypto from "node:crypto";

function isEmail(s: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
}

function safeEqual(a: Buffer, b: Buffer) {
  if (a.length !== b.length) return false;
  return crypto.timingSafeEqual(a, b);
}

// Formato guardado: scrypt$<saltHex>$<hashHex>
function verifyPassword(password: string, stored: string) {
  const [alg, saltHex, hashHex] = stored.split("$");
  if (alg !== "scrypt" || !saltHex || !hashHex) return false;

  const salt = Buffer.from(saltHex, "hex");
  const expected = Buffer.from(hashHex, "hex");
  const got = crypto.scryptSync(password, salt, expected.length);

  return safeEqual(got, expected);
}

const googleClientId =
  (process.env.GOOGLE_CLIENT_ID || process.env.AUTH_GOOGLE_ID || "").trim();

const googleClientSecret =
  (process.env.GOOGLE_CLIENT_SECRET || process.env.AUTH_GOOGLE_SECRET || "").trim();

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

        const r = await pool.query(
          `SELECT id, email, password_hash, email_verified_at
           FROM users
           WHERE email = $1
           LIMIT 1`,
          [email]
        );

        if (r.rowCount === 0) return null;
        const u = r.rows[0];

        // Debe tener password_hash (si es Google-only, no)
        if (!u.password_hash) return null;

        // Debe estar verificado
        if (!u.email_verified_at) return null;

        const ok = verifyPassword(password, String(u.password_hash));
        if (!ok) return null;

        return { id: String(u.id), email: String(u.email) };
      },
    }),
  ],

  callbacks: {
    async jwt({ token, user }) {
      if (user?.id) (token as any).uid = user.id;
      return token;
    },
    async session({ session, token }) {
      if (session.user && (token as any)?.uid) (session.user as any).id = (token as any).uid;
      return session;
    },
  },
};
