// apps/web/src/lib/events.server.ts
import "server-only";
import { pool } from "@/lib/db";
import type { Event, TicketType } from "@/lib/events";

/**
 * Nota:
 * - Esto asume tablas: events (id, slug, title, city, venue, date_iso, description, image?, hero_desktop?, hero_mobile?)
 * - y ticket_types (id, event_id, name, price_clp, capacity, sold, held, slug?).
 *
 * Si no tienes image/hero en DB, aplicamos fallbacks por slug.
 */

function safeString(v: any) {
  return typeof v === "string" ? v : "";
}

function eventAssetsFallback(slug: string) {
  return {
    image: `/events/${slug}.jpg`,
    hero: {
      desktop: `/banners/1400x450/${slug}.jpg`,
      mobile: `/banners/800x400/${slug}.jpg`,
    },
  };
}

function rowToTicketType(row: any): TicketType {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    priceCLP: Number(row.price_clp ?? 0),

    // Opcionales (si existen en tu tabla)
    capacity: row.capacity === null || row.capacity === undefined ? undefined : Number(row.capacity),
    sold: row.sold === null || row.sold === undefined ? undefined : Number(row.sold),
    held: row.held === null || row.held === undefined ? undefined : Number(row.held),

    // UI-only: maxPerOrder (no viene de DB por defecto)
    maxPerOrder: undefined,
  };
}

function rowToEvent(row: any): Event {
  const slug = String(row.slug);
  const fb = eventAssetsFallback(slug);

  const image = safeString(row.image) || fb.image;

  const heroDesktop = safeString(row.hero_desktop) || safeString(row.banner_desktop) || fb.hero.desktop;
  const heroMobile = safeString(row.hero_mobile) || safeString(row.banner_mobile) || fb.hero.mobile;

  return {
    id: String(row.id),
    slug,
    title: String(row.title ?? ""),
    city: String(row.city ?? ""),
    venue: String(row.venue ?? ""),
    dateISO: new Date(row.date_iso).toISOString(), // consistente
    image,
    hero: { desktop: heroDesktop, mobile: heroMobile },
    description: String(row.description ?? ""),
    ticketTypes: [],
  };
}

export async function getEventBySlugDb(slug: string): Promise<Event | undefined> {
  const client = await pool.connect();
  try {
    const ev = await client.query(
      `
      SELECT id, slug, title, city, venue, date_iso, description,
             image, hero_desktop, hero_mobile
      FROM events
      WHERE slug = $1
      LIMIT 1
      `,
      [slug]
    );

    if (ev.rowCount === 0) return undefined;

    const event = rowToEvent(ev.rows[0]);

    const tt = await client.query(
      `
      SELECT id, name, price_clp, capacity, sold, held
      FROM ticket_types
      WHERE event_id = $1
      ORDER BY price_clp ASC, name ASC
      `,
      [event.id]
    );

    event.ticketTypes = tt.rows.map(rowToTicketType);
    return event;
  } finally {
    client.release();
  }
}

export async function getEventByIdDb(id: string): Promise<Event | undefined> {
  const client = await pool.connect();
  try {
    const ev = await client.query(
      `
      SELECT id, slug, title, city, venue, date_iso, description,
             image, hero_desktop, hero_mobile
      FROM events
      WHERE id = $1
      LIMIT 1
      `,
      [id]
    );

    if (ev.rowCount === 0) return undefined;

    const event = rowToEvent(ev.rows[0]);

    const tt = await client.query(
      `
      SELECT id, name, price_clp, capacity, sold, held
      FROM ticket_types
      WHERE event_id = $1
      ORDER BY price_clp ASC, name ASC
      `,
      [event.id]
    );

    event.ticketTypes = tt.rows.map(rowToTicketType);
    return event;
  } finally {
    client.release();
  }
}

/**
 * Opcional: lista de eventos (para /eventos)
 */
export async function listEventsDb(): Promise<Event[]> {
  const client = await pool.connect();
  try {
    const r = await client.query(
      `
      SELECT id, slug, title, city, venue, date_iso, description,
             image, hero_desktop, hero_mobile
      FROM events
      ORDER BY date_iso ASC
      `
    );

    // Cargamos ticketTypes por evento (N+1). Si quieres pro, lo optimizamos luego con JOIN.
    const out: Event[] = [];
    for (const row of r.rows) {
      const e = rowToEvent(row);
      const tt = await client.query(
        `
        SELECT id, name, price_clp, capacity, sold, held
        FROM ticket_types
        WHERE event_id = $1
        ORDER BY price_clp ASC, name ASC
        `,
        [e.id]
      );
      e.ticketTypes = tt.rows.map(rowToTicketType);
      out.push(e);
    }
    return out;
  } finally {
    client.release();
  }
}
