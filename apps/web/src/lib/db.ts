// apps/web/src/lib/db.ts
import { Pool, type PoolClient } from "pg";

export const runtime = "nodejs";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function mustConnString() {
  // 1) Preferir Neon/Vercel integration con prefijo (tu proyecto real)
  const prefixed =
    process.env.TICKETCHILE_DB_POSTGRES_URL ||
    process.env.TICKETCHILE_DB_POSTGRES_URL_NON_POOLING;

  // 2) Compatibilidad: variables genéricas (legacy)
  const legacy = process.env.DATABASE_URL || process.env.POSTGRES_URL;

  const cs = prefixed || legacy;

  if (!cs) {
    throw new Error(
      "Missing DB connection string. Expected TICKETCHILE_DB_POSTGRES_URL (preferred) or DATABASE_URL/POSTGRES_URL (legacy)."
    );
  }

  // 🔒 Safety check: si existe el prefijo, NO permitimos caer a legacy por accidente
  if (prefixed && legacy && cs === legacy) {
    throw new Error(
      "DB misconfiguration: prefixed Neon vars exist but code is using legacy DATABASE_URL/POSTGRES_URL. Fix env or code."
    );
  }

  return cs;
}


/**
 * Mata el warning de pg-connection-string:
 * - Si tu URL trae sslmode=require|prefer|verify-ca => lo eliminamos del query
 * - Controlamos SSL por config (ssl: { rejectUnauthorized: true })
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
  // (tu env en Vercel se llama DATABASE_SSL = true)
  const useSSL = envBool("DATABASE_SSL", process.env.NODE_ENV === "production");
  const max = envInt("DATABASE_POOL_MAX", 5);

  global.__pgPool = new Pool({
    connectionString,
    max,
    ssl: useSSL ? { rejectUnauthorized: true } : undefined,
  });

  return global.__pgPool;
})();

/**
 * Helper transaccional que tu webhook está esperando.
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
