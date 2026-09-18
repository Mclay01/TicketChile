import fs from "node:fs/promises";
import crypto from "node:crypto";
import { fileURLToPath } from "node:url";
import pg from "pg";

export function assertLocalDatabase(connectionString) {
  const url = new URL(connectionString);
  if (!["127.0.0.1", "localhost", "[::1]"].includes(url.hostname) || !/^\/ticketchile_(test|local)[a-z0-9_]*$/.test(url.pathname)) {
    throw new Error("Only an explicit ticketchile_test/local database on loopback is permitted");
  }
  if (url.search) throw new Error("Database URL options are not permitted in the local migration runner");
}

export async function migrate(pool, directory = new URL("../sql/migrations/", import.meta.url)) {
  const client = await pool.connect();
  try {
    await client.query("SELECT pg_advisory_lock(7319321)");
    await client.query(`CREATE TABLE IF NOT EXISTS schema_migrations (
      version text PRIMARY KEY, checksum text NOT NULL, applied_at timestamptz NOT NULL DEFAULT now())`);
    const files = (await fs.readdir(directory)).filter(name => /^\d{4}_[a-z0-9_]+\.sql$/.test(name)).sort();
    const applied=await client.query("SELECT version FROM schema_migrations ORDER BY version");
    if(applied.rows.some(row=>!files.includes(row.version)))throw new Error("Database contains migrations absent from this checkout");
    const latest=applied.rows.at(-1)?.version;
    if(latest&&files.some(file=>file<latest&&!applied.rows.some(row=>row.version===file)))throw new Error("Out-of-order migration: append a new version instead");
    for (const file of files) {
      const sql = (await fs.readFile(new URL(file, directory), "utf8")).replace(/\r\n/g,"\n");
      const checksum = crypto.createHash("sha256").update(sql).digest("hex");
      const previous = await client.query("SELECT checksum FROM schema_migrations WHERE version=$1", [file]);
      if (previous.rowCount) {
        if (previous.rows[0].checksum !== checksum) throw new Error(`Migration checksum mismatch: ${file}`);
        continue;
      }
      // An existing installation must be reconciled explicitly; never auto-adopt
      // schema.sql or conceal drift with CREATE TABLE IF NOT EXISTS everywhere.
      if (file.startsWith("0001")) {
        const existing = await client.query("SELECT tablename FROM pg_tables WHERE schemaname='public' AND tablename<>'schema_migrations'");
        if (existing.rowCount) throw new Error("Existing schema: reconcile and approve a baseline catalog before adoption. No application tables changed.");
      }
      await client.query("BEGIN");
      try {
        await client.query("SET LOCAL lock_timeout='5s'");
        await client.query(sql);
        await client.query("INSERT INTO schema_migrations(version,checksum) VALUES ($1,$2)", [file, checksum]);
        await client.query("COMMIT");
      } catch (error) { await client.query("ROLLBACK"); throw error; }
    }
  } finally {
    await client.query("SELECT pg_advisory_unlock(7319321)");
    client.release();
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const connectionString = process.env.MIGRATION_DATABASE_URL || "";
  assertLocalDatabase(connectionString);
  const pool = new pg.Pool({ connectionString });
  try { await migrate(pool); console.log("Local versioned migrations verified/applied."); }
  finally { await pool.end(); }
}
