import { pool } from "./db";
import { EVENTS } from "./events";

export async function seedFromEvents() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    for (const e of EVENTS) {
      await client.query(
        `
        INSERT INTO events (id, slug, title, city, venue, date_iso, description)
        VALUES ($1,$2,$3,$4,$5,$6,$7)
        ON CONFLICT (id) DO UPDATE SET
          slug = EXCLUDED.slug,
          title = EXCLUDED.title,
          city = EXCLUDED.city,
          venue = EXCLUDED.venue,
          date_iso = EXCLUDED.date_iso,
          description = EXCLUDED.description
        `,
        [e.id, e.slug, e.title, e.city, e.venue, e.dateISO, e.description]
      );

      for (const tt of e.ticketTypes) {
        await client.query(
          `
          INSERT INTO ticket_types (event_id, id, name, price_clp, capacity, sold)
          VALUES ($1,$2,$3,$4,$5,$6)
          ON CONFLICT (event_id, id) DO UPDATE SET
            name = EXCLUDED.name,
            price_clp = EXCLUDED.price_clp,
            capacity = EXCLUDED.capacity
          `,
          [e.id, tt.id, tt.name, tt.priceCLP, tt.capacity, tt.sold ?? 0]
        );
      }
    }

    await client.query("COMMIT");
    return { ok: true };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}
