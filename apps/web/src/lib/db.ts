// apps/web/src/lib/db.ts
import { Pool } from "pg";

export const runtime = "nodejs";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function mustConnString() {
  const cs = process.env.DATABASE_URL || process.env.POSTGRES_URL;
  if (!cs) throw new Error("Missing DATABASE_URL (or POSTGRES_URL).");
  return cs;
}

/**
 * Mata el warning de pg-connection-string:
 * - Si tu URL trae sslmode=require|prefer|verify-ca => lo eliminamos del query
 * - Controlamos SSL por config (ssl: { rejectUnauthorized: true })
 */
function stripSslMode(cs: string) {
  // Intento “URL parser” (robusto)
  try {
    const u = new URL(cs);
    // Parametros que suelen venir en Neon/Vercel
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    u.searchParams.delete("uselibpqcompat");
    return u.toString();
  } catch {
    // Fallback por regex si la URL no parsea por caracteres raros
    let out = cs;

    // elimina sslmode=... (con ? o &)
    out = out.replace(/([?&])sslmode=[^&]+(&)?/gi, (m, p1, p2) => (p1 === "?" && p2 ? "?" : p2 ? p1 : ""));
    // elimina ssl=... y uselibpqcompat=...
    out = out.replace(/([?&])ssl=[^&]+(&)?/gi, (m, p1, p2) => (p1 === "?" && p2 ? "?" : p2 ? p1 : ""));
    out = out.replace(/([?&])uselibpqcompat=[^&]+(&)?/gi, (m, p1, p2) => (p1 === "?" && p2 ? "?" : p2 ? p1 : ""));

    // limpia ? final o && o ?&
    out = out.replace(/\?$/, "");
    out = out.replace(/\?&/, "?");
    out = out.replace(/&&/g, "&");
    out = out.replace(/[?&]$/, "");

    return out;
  }
}

function envBool(name: string, def: boolean) {
  const v = String(process.env[name] ?? "").trim().toLowerCase();
  if (!v) return def;
  return v === "true" || v === "1" || v === "yes";
}

function envInt(name: string, def: number) {
  const n = Number(process.env[name]);
  return Number.isFinite(n) && n > 0 ? Math.floor(n) : def;
}

export const pool: Pool = (() => {
  if (global.__pgPool) return global.__pgPool;

  const raw = mustConnString();
  const connectionString = stripSslMode(raw);

  const useSSL = envBool("DATABASE_SSL", process.env.NODE_ENV === "production");
  const max = envInt("DATABASE_POOL_MAX", 5);

  global.__pgPool = new Pool({
    connectionString,
    max,
    // Con Neon/Vercel esto es lo normal:
    ssl: useSSL ? { rejectUnauthorized: true } : undefined,
  });

  return global.__pgPool;
})();
