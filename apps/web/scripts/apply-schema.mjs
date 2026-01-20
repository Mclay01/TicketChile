import fs from "node:fs";
import path from "node:path";
import pg from "pg";
import dotenv from "dotenv";

dotenv.config({ path: path.resolve(process.cwd(), "apps/web/.env.local") });

const { Pool } = pg;

const conn =
  process.env.POSTGRES_URL_NON_POOLING ||
  process.env.DATABASE_URL_UNPOOLED ||
  process.env.POSTGRES_URL ||
  process.env.DATABASE_URL;

if (!conn) {
  console.error("Falta POSTGRES_URL_NON_POOLING / POSTGRES_URL / DATABASE_URL en el entorno.");
  process.exit(1);
}

const isLocal = conn.includes("localhost") || conn.includes("127.0.0.1");
const pool = new Pool({
  connectionString: conn,
  ssl: isLocal ? undefined : { rejectUnauthorized: false },
});

// (Opcional pero MUY útil) ver a qué host estás conectando sin mostrar secretos
try {
  const u = new URL(conn);
  console.log("🔌 Conectando a:", u.hostname);
} catch {}

const schemaPath = path.resolve(process.cwd(), "apps/web/sql/schema.sql");
const sql = fs.readFileSync(schemaPath, "utf8");

await pool.query(sql);
await pool.end();

console.log("✅ Schema aplicado OK");
