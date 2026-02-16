// apps/web/src/app/api/events/by-slug/[slug]/route.ts
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

  // ticket_types
  // eslint-disable-next-line no-var
  var __ticketchile_tt_has_max_per_order: Promise<boolean> | undefined;
  // eslint-disable-next-line no-var
  var __ticketchile_tt_has_capacity: Promise<boolean> | undefined;
  // eslint-disable-next-line no-var
  var __ticketchile_tt_has_sold: Promise<boolean> | undefined;
  // eslint-disable-next-line no-var
  var __ticketchile_tt_has_held: Promise<boolean> | undefined;
}

async function columnExists(table: string, columnName: string): Promise<boolean> {
  const q = await pool.query(
    `
    SELECT 1
    FROM information_schema.columns
    WHERE table_schema='public'
      AND table_name=$1
      AND column_name=$2
    LIMIT 1
    `,
    [table, columnName]
  );
  return (q.rowCount ?? 0) > 0;
}

function eventsHasImage() {
  return (global.__ticketchile_events_has_image ??=
    columnExists("events", "image"));
}
function eventsHasHeroDesktop() {
  return (global.__ticketchile_events_has_hero_desktop ??=
    columnExists("events", "hero_desktop"));
}
function eventsHasHeroMobile() {
  return (global.__ticketchile_events_has_hero_mobile ??=
    columnExists("events", "hero_mobile"));
}

function ttHasMaxPerOrder() {
  return (global.__ticketchile_tt_has_max_per_order ??=
    columnExists("ticket_types", "max_per_order"));
}
function ttHasCapacity() {
  return (global.__ticketchile_tt_has_capacity ??=
    columnExists("ticket_types", "capacity"));
}
function ttHasSold() {
  return (global.__ticketchile_tt_has_sold ??=
    columnExists("ticket_types", "sold"));
}
function ttHasHeld() {
  return (global.__ticketchile_tt_has_held ??=
    columnExists("ticket_types", "held"));
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

export async function GET(_req: NextRequest, ctx: { params: Promise<{ slug: string }> }) {
  const { slug } = await ctx.params;
  const s = pickString(slug);
  if (!s) return NextResponse.json({ ok: false, error: "slug_missing" }, { status: 400 });

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
    WHERE e.slug = $1
    LIMIT 1
    `,
    [s]
  );

  if (q.rowCount === 0) {
    return NextResponse.json({ ok: false, error: "not_found" }, { status: 404 });
  }

  const ev = q.rows[0];

  const [hasMaxPerOrder, hasCapacity, hasSold, hasHeld] = await Promise.all([
    ttHasMaxPerOrder(),
    ttHasCapacity(),
    ttHasSold(),
    ttHasHeld(),
  ]);

  const ttSelect = [
    "id",
    "name",
    "price_clp",
    hasMaxPerOrder ? "max_per_order" : "NULL::int AS max_per_order",
    hasCapacity ? "capacity" : "NULL::int AS capacity",
    hasSold ? "sold" : "NULL::int AS sold",
    hasHeld ? "held" : "NULL::int AS held",
  ].join(", ");

  const tts = await pool.query(
    `
    SELECT ${ttSelect}
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
