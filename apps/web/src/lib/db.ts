// apps/web/src/lib/db.ts
import { Pool, type PoolClient } from "pg";

export const runtime = "nodejs";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

/**
 * ✅ Regla definitiva:
 * - Si existe el prefijo del proyecto (TICKETCHILE_DB_POSTGRES_URL*), se usa ese.
 * - Si además existe DATABASE_URL/POSTGRES_URL, NO hacemos drama (pueden ser iguales).
 * - Fallbacks para Vercel/Neon estándar por si cambias integración.
 */
function mustConnString() {
  const candidates = [
    // Preferidos (tu integración real)
    process.env.TICKETCHILE_DB_POSTGRES_URL,
    process.env.TICKETCHILE_DB_POSTGRES_URL_NON_POOLING,

    // Vercel/Neon estándar (por si algún día cambias naming)
    process.env.POSTGRES_URL,
    process.env.POSTGRES_URL_NON_POOLING,
    process.env.POSTGRES_PRISMA_URL,

    // Legacy
    process.env.DATABASE_URL,
  ].filter((x): x is string => !!x && String(x).trim().length > 0);

  const cs = candidates[0];
  if (!cs) {
    throw new Error(
      "Missing DB connection string. Set TICKETCHILE_DB_POSTGRES_URL (preferred) or POSTGRES_URL/DATABASE_URL."
    );
  }

  return cs;
}

/**
 * Evita warnings del parser y centraliza SSL config en el Pool.
 */
function stripSslMode(cs: string) {
  try {
    const u = new URL(cs);
    u.searchParams.delete("sslmode");
    u.searchParams.delete("ssl");
    u.searchParams.delete("uselibpqcompat");
    return u.toString();
  } catch {
    let out = cs;

    const dropParam = (key: string) => {
      out = out.replace(
        new RegExp(`([?&])${key}=[^&]+(&)?`, "gi"),
        (_m, p1, p2) => (p1 === "?" && p2 ? "?" : p2 ? p1 : "")
      );
    };

    dropParam("sslmode");
    dropParam("ssl");
    dropParam("uselibpqcompat");

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

  // En prod: SSL normalmente sí o sí
  const useSSL = envBool("DATABASE_SSL", process.env.NODE_ENV === "production");

  // Por compatibilidad: deja override por env si algún día te falla el CA chain
  const rejectUnauthorized = envBool("DATABASE_SSL_REJECT_UNAUTHORIZED", true);

  const max = envInt("DATABASE_POOL_MAX", 5);

  global.__pgPool = new Pool({
    connectionString,
    max,
    ssl: useSSL ? { rejectUnauthorized } : undefined,
  });

  return global.__pgPool;
})();

/**
 * Helper transaccional
 */
export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const result = await fn(client);
    await client.query("COMMIT");
    return result;
  } catch (e) {
    try {
      await client.query("ROLLBACK");
    } catch {}
    throw e;
  } finally {
    client.release();
  }
}
