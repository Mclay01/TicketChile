import { Pool } from "pg";

const connectionString =
  process.env.POSTGRES_URL ?? process.env.DATABASE_URL;

if (!connectionString) {
  throw new Error("Falta POSTGRES_URL o DATABASE_URL en el entorno.");
}

export const pool = new Pool({
  connectionString,
  ssl: { rejectUnauthorized: false },
});
