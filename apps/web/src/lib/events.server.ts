import "server-only";
import { pool } from "@/lib/db";
import type { Event, TicketType } from "@/lib/events";
import { catalogFilters, type SearchValues } from "@/lib/discovery";
import { eventMedia } from "@/lib/media";

type Row = {short_description:string;seo_title:string;seo_description:string; id: string; slug: string; title: string; city: string; venue: string; date_iso: string | Date; description: string;
  timezone: string; end_at: string | Date | null; address: string; age_policy: string; access_info: string; faq: string;
  image: string; hero_desktop: string; hero_mobile: string; category_slug: string; category_name: string; organizer_name: string;
  tiers: { id: string; name: string; price_clp: number; capacity: number; sold: number; held: number; max_per_order: number | null }[] };
const selection = `SELECT e.*, c.name AS category_name, org.display_name AS organizer_name,
  COALESCE(t.tiers,'[]'::jsonb) AS tiers FROM events e
  LEFT JOIN event_categories c ON c.slug=e.category_slug
  LEFT JOIN organizer_events oe ON oe.event_id=e.id
  LEFT JOIN organizer_users org ON org.id=oe.organizer_id
  LEFT JOIN LATERAL (SELECT jsonb_agg(jsonb_build_object('id',tt.id,'name',tt.name,'price_clp',tt.price_clp,
   'capacity',tt.capacity,'sold',tt.sold,'held',tt.held,'max_per_order',tt.max_per_order) ORDER BY tt.price_clp,tt.id) AS tiers
   FROM ticket_types tt WHERE tt.event_id=e.id AND tt.visible AND tt.active) t ON true`;
export function rowToEvent(row: Row): Event {
  const ticketTypes: TicketType[] = row.tiers.map(t => ({ id: t.id, name: t.name, priceCLP: Number(t.price_clp),
    capacity: Number(t.capacity), sold: Number(t.sold), held: Number(t.held), maxPerOrder: t.max_per_order ?? 10 }));
  const image = eventMedia(row.image, row.id);
  return { id: row.id, slug: row.slug, title: row.title, city: row.city, venue: row.venue, dateISO: new Date(row.date_iso).toISOString(),
    timezone:row.timezone,endISO:row.end_at?new Date(row.end_at).toISOString():undefined,address:row.address,agePolicy:row.age_policy,accessInfo:row.access_info,faq:row.faq,
    description: row.description, shortDescription:row.short_description,seoTitle:row.seo_title,seoDescription:row.seo_description,image, hero: { desktop: row.hero_desktop ? eventMedia(row.hero_desktop, row.id, "desktop") : image, mobile: row.hero_mobile ? eventMedia(row.hero_mobile, row.id, "mobile") : image },
    category: row.category_slug || undefined, categoryName: row.category_name || undefined, organizerName: row.organizer_name || undefined, ended: new Date(row.date_iso).getTime() < Date.now(), ticketTypes };
}
export async function getEventBySlugDb(slug: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(slug)) return undefined;
  const result = await pool.query<Row>(`${selection} WHERE e.slug=$1 AND e.is_published LIMIT 1`, [slug]);
  return result.rows[0] ? rowToEvent(result.rows[0]) : undefined;
}
export async function getEventByIdDb(id: string) {
  if (!/^[a-zA-Z0-9_-]{1,200}$/.test(id)) return undefined;
  const result = await pool.query<Row>(`${selection} WHERE e.id=$1 AND e.is_published LIMIT 1`, [id]);
  return result.rows[0] ? rowToEvent(result.rows[0]) : undefined;
}
export async function catalogDb(input: SearchValues = {}) {
  const filters = catalogFilters(input);
  const term = `%${filters.q.replace(/[\\%_]/g, "\\$&")}%`;
  const params = [term, filters.city, filters.category, filters.when];
  const where = `e.is_published AND e.visibility='PUBLIC' AND e.date_iso >= now() AND
    (e.title ILIKE $1 OR e.venue ILIKE $1 OR e.city ILIKE $1) AND ($2='' OR e.city=$2)
    AND ($3='' OR e.category_slug=$3) AND ($4<>'week' OR e.date_iso<now()+interval '7 days')`;
  const sort = filters.sort === "date" ? "e.date_iso ASC" : `(SELECT min(price_clp) FROM ticket_types WHERE event_id=e.id AND visible AND active) ${filters.sort === "price_desc" ? "DESC" : "ASC"} NULLS LAST`;
  const [rows, count] = await Promise.all([
    pool.query<Row>(`${selection} WHERE ${where} ORDER BY ${sort},e.id LIMIT 12 OFFSET $5`, [...params, (filters.page - 1) * 12]),
    pool.query<{ total: string }>(`SELECT count(*) AS total FROM events e WHERE ${where}`, params),
  ]);
  return { events: rows.rows.map(rowToEvent), total: Number(count.rows[0].total), filters, pageSize: 12 };
}
export async function discoveryFacets() {
  const [categories, cities] = await Promise.all([
    pool.query<{ slug: string; name: string; count: number }>(`SELECT c.slug,c.name,count(e.id)::int AS count FROM event_categories c
      LEFT JOIN events e ON e.category_slug=c.slug AND e.is_published AND e.visibility='PUBLIC' AND e.date_iso>=now() GROUP BY c.slug ORDER BY c.position,c.slug`),
    pool.query<{ city: string; count: number }>(`SELECT city,count(*)::int AS count FROM events WHERE is_published AND visibility='PUBLIC' AND date_iso>=now() GROUP BY city ORDER BY count(*) DESC,city LIMIT 50`),
  ]);
  return { categories: categories.rows, cities: cities.rows };
}
export async function listEventsDb() { return (await catalogDb()).events; }
