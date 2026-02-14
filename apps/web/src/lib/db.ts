// apps/web/src/lib/db.ts
import { Pool, type PoolClient } from "pg";

export const runtime = "nodejs";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

/**
 * Resuelve connection string con prioridad clara:
 * 1) DATABASE_URL (tu variable estándar, la que ya creaste)
 * 2) TICKETCHILE_DB_POSTGRES_URL / _NON_POOLING (Neon prefijado)
 * 3) POSTGRES_URL (legacy)
 *
 * Importante: NO tiramos error si existen varias. Elegimos una y listo.
 */
function mustConnString() {
  const databaseUrl = process.env.DATABASE_URL;

  const prefixed =
    process.env.TICKETCHILE_DB_POSTGRES_URL ||
    process.env.TICKETCHILE_DB_POSTGRES_URL_NON_POOLING;

  const legacy = process.env.POSTGRES_URL;

  const cs = databaseUrl || prefixed || legacy;

  if (!cs) {
    throw new Error(
      "Missing DB connection string. Set DATABASE_URL (recommended) or TICKETCHILE_DB_POSTGRES_URL or POSTGRES_URL."
    );
  }

  return cs;
}

/**
 * Mata el warning de pg-connection-string:
 * - Si tu URL trae sslmode=require|prefer|verify-ca => lo eliminamos del query
 * - Controlamos SSL por config (ssl: {...})
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

  // En prod normalmente sí o sí SSL.
  // Puedes forzarlo con DATABASE_SSL=true/false
  const useSSL = envBool("DATABASE_SSL", process.env.NODE_ENV === "production");
  const max = envInt("DATABASE_POOL_MAX", 5);

  global.__pgPool = new Pool({
    connectionString,
    max,

    // Neon/Vercel serverless: rejectUnauthorized: true suele romper por CA chain.
    // Si tú quieres estrictamente true, setealo vía env (ver abajo).
    ssl: useSSL
      ? {
          rejectUnauthorized: envBool(
            "DATABASE_SSL_REJECT_UNAUTHORIZED",
            false
          ),
        }
      : undefined,
  });

  return global.__pgPool;
})();

/**
 * Helper transaccional:
 * - BEGIN
 * - fn(client)
 * - COMMIT / ROLLBACK
 * - release()
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
