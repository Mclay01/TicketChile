// apps/web/src/app/api/events/[id]/route.ts
import { NextRequest, NextResponse } from "next/server";
import { pool } from "@/lib/db";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

declare global {
  // eslint-disable-next-line no-var
  var __ticketchile_events_has_image: Promise<boolean> | undefined;
  // eslint-disable-next-line no-var
  var __ticketchile_events_has_hero_desktop: Promise<boolean> | undefined;
  // eslint-disable-next-line no-var
  var __ticketchile_events_has_hero_mobile: Promise<boolean> | undefined;
}

async function columnExists(columnName: string): Promise<boolean> {
  const q = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name='events'
      AND column_name=$1
    LIMIT 1
    `,
    [columnName]
  );
  return (q.rowCount ?? 0) > 0;
}

function eventsHasImage(): Promise<boolean> {
  if (!global.__ticketchile_events_has_image) global.__ticketchile_events_has_image = columnExists("image");
  return global.__ticketchile_events_has_image;
}
function eventsHasHeroDesktop(): Promise<boolean> {
  if (!global.__ticketchile_events_has_hero_desktop)
    global.__ticketchile_events_has_hero_desktop = columnExists("hero_desktop");
  return global.__ticketchile_events_has_hero_desktop;
}
function eventsHasHeroMobile(): Promise<boolean> {
  if (!global.__ticketchile_events_has_hero_mobile)
    global.__ticketchile_events_has_hero_mobile = columnExists("hero_mobile");
  return global.__ticketchile_events_has_hero_mobile;
}

function defaultImageFor(slug: string) {
  return `/events/${slug}.jpg`;
}
function defaultHeroDesktopFor(slug: string) {
  return `/banners/1400x450/${slug}.jpg`;
}
function defaultHeroMobileFor(slug: string) {
  return `/banners/800x400/${slug}.jpg`;
}

export async function GET(_req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  const s = pickString(id);
  if (!s) return NextResponse.json({ ok: false, error: "id_missing" }, { status: 400 });

  const [hasImage, hasHeroDesktop, hasHeroMobile] = await Promise.all([
    eventsHasImage(),
    eventsHasHeroDesktop(),
    eventsHasHeroMobile(),
  ]);

  const selectCols = [
    "e.id",
    "e.slug",
    "e.title",
    "e.city",
    "e.venue",
    "e.date_iso",
    "e.description",
    hasImage ? "e.image" : "NULL::text AS image",
    hasHeroDesktop ? "e.hero_desktop" : "NULL::text AS hero_desktop",
    hasHeroMobile ? "e.hero_mobile" : "NULL::text AS hero_mobile",
  ].join(", ");

  const q = await pool.query(
    `
    SELECT ${selectCols}
    FROM events e
    WHERE e.id = $1
    LIMIT 1
    `,
    [s]
  );

  if (q.rowCount === 0) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const ev = q.rows[0];

  const tts = await pool.query(
    `
    SELECT id, name, price_clp, max_per_order, capacity, sold, held
    FROM ticket_types
    WHERE event_id = $1
    ORDER BY price_clp ASC
    `,
    [String(ev.id)]
  );

  const image = pickString(ev.image) || defaultImageFor(ev.slug);
  const heroDesktop = pickString(ev.hero_desktop) || defaultHeroDesktopFor(ev.slug);
  const heroMobile = pickString(ev.hero_mobile) || defaultHeroMobileFor(ev.slug);

  return NextResponse.json({
    id: String(ev.id),
    slug: String(ev.slug),
    title: String(ev.title),
    city: String(ev.city),
    venue: String(ev.venue),
    date_iso: ev.date_iso,
    description: String(ev.description ?? ""),
    image,
    hero: { desktop: heroDesktop, mobile: heroMobile },
    ticket_types: tts.rows.map((r) => ({
      id: String(r.id),
      name: String(r.name),
      price_clp: Number(r.price_clp),
      max_per_order: r.max_per_order == null ? null : Number(r.max_per_order),
      capacity: r.capacity == null ? null : Number(r.capacity),
      sold: r.sold == null ? null : Number(r.sold),
      held: r.held == null ? null : Number(r.held),
    })),
  });
}
