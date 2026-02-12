import { Pool, PoolClient } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (!connectionString) throw new Error("Falta DATABASE_URL");

  // En Vercel/Prod normalmente necesitas SSL. Si tu provider no lo requiere, deja DATABASE_SSL=false.
  const ssl =
    process.env.DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined;

  return new Pool({
    connectionString,
    ssl,
    max: Number(process.env.DATABASE_POOL_MAX || 5),
    idleTimeoutMillis: 30_000,
    connectionTimeoutMillis: 10_000,
  });
}

export const pool = globalThis.__pgPool ?? getPool();
if (process.env.NODE_ENV !== "production") globalThis.__pgPool = pool;

export async function withTx<T>(fn: (client: PoolClient) => Promise<T>): Promise<T> {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const out = await fn(client);
    await client.query("COMMIT");
    return out;
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}
