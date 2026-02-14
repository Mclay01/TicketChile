// apps/web/src/lib/db.ts
import { Pool } from "pg";

declare global {
  // eslint-disable-next-line no-var
  var __pgPool: Pool | undefined;
}

/**
 * Intenta resolver el connection string desde:
 * 1) DATABASE_URL (estándar)
 * 2) POSTGRES_URL (Vercel/Neon legacy)
 * 3) TICKETCHILE_DB_POSTGRES_URL (tu variable prefijada)
 * 4) Cualquier var que termine en _POSTGRES_URL (fallback para otros prefijos)
 */
function resolveConnectionString(): string | null {
  const direct =
    process.env.DATABASE_URL ||
    process.env.POSTGRES_URL ||
    process.env.TICKETCHILE_DB_POSTGRES_URL;

  if (direct && direct.trim()) return direct.trim();

  // Fallback genérico: busca cualquier *_POSTGRES_URL
  for (const [k, v] of Object.entries(process.env)) {
    if (k.endsWith("_POSTGRES_URL") && typeof v === "string" && v.trim()) {
      return v.trim();
    }
  }

  return null;
}

function isBuildTime() {
  // En Vercel, durante build suele venir VERCEL=1 y NODE_ENV=production
  // Esto evita que tu build muera por DB si Next intenta “collect page data”.
  return process.env.VERCEL === "1" && process.env.VERCEL_ENV === "production" && process.env.NEXT_PHASE;
}

export const pool: Pool = (() => {
  if (global.__pgPool) return global.__pgPool;

  const connectionString = resolveConnectionString();

  // Si NO hay connection string, lanzamos error normal.
  // Ojo: si quieres que build no reviente nunca, puedes NO lanzar aquí,
  // pero lo correcto es que existan envs.
  if (!connectionString) {
    throw new Error(
      "Missing database connection string. Set DATABASE_URL (recommended) or POSTGRES_URL or TICKETCHILE_DB_POSTGRES_URL."
    );
  }

  global.__pgPool = new Pool({
    connectionString,
    // Neon suele requerir SSL. Si tu URL ya viene con sslmode=require, esto igual ok.
    ssl: connectionString.includes("sslmode=") ? undefined : { rejectUnauthorized: false },
  });

  return global.__pgPool;
})();
