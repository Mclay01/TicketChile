// src/lib/events.ts

export type TicketType = {
  id: string;
  name: string;
  priceCLP: number;

  // Opcionales (UI). No afectan tu DB.
  maxPerOrder?: number;
  capacity?: number;
  sold?: number;
  held?: number;
};

export type Event = {
  id: string;
  slug: string;
  title: string;
  city: string;
  venue: string;
  dateISO: string;

  // Poster vertical (cards + detalle)
  image: string;

  // ✅ Banner horizontal (desktop + mobile)
  hero?: {
    desktop: string;
    mobile: string;
  };

  description: string;
  ticketTypes: TicketType[];
};

/**
 * ⚠️ IMPORTANTE
 * EVENTS queda solo como fallback/demo. En prod, la venta real debe venir desde DB/API
 * para que los IDs (tt_001, tt_002, etc) calcen con Postgres y no con hardcode.
 */
export const EVENTS: Event[] = [
  {
    id: "evt_001",
    slug: "fiesta-verano",
    title: "Fiesta Verano",
    city: "Santiago",
    venue: "Ubicación por confirmar",
    dateISO: "2026-01-15T01:00:00-03:00",
    image: "/events/fiesta-verano.jpg",
    hero: {
      desktop: "/banners/1400x450/fiesta-verano.jpg",
      mobile: "/banners/800x400/fiesta-verano.jpg",
    },
    description: `DJ – Tragos – Música.

Acceso por QR. +18. Cupos limitados.`,
    ticketTypes: [{ id: "tt_general", name: "Entrada", priceCLP: 5500, maxPerOrder: 10 }],
  },
  {
    id: "evt_002",
    slug: "sunset-party",
    title: "La Frida — Sunset Party",
    city: "Santiago",
    venue: "Disco Bar La Frida",
    dateISO: "2026-04-22T17:00:00-03:00",
    image: "/events/sunset-party.jpg",
    hero: {
      desktop: "/banners/1400x450/sunset-party.jpg",
      mobile: "/banners/800x400/sunset-party.jpg",
    },
    description: `Sunset + after party.

Acceso por QR. +18. Producción completa.`,
    ticketTypes: [
      { id: "tt_preventa", name: "Preventa", priceCLP: 10000, maxPerOrder: 10 },
      { id: "tt_general", name: "General", priceCLP: 12000, maxPerOrder: 10 },
    ],
  },
  {
    id: "evt_003",
    slug: "noche-rock",
    title: "Noche de Rock",
    city: "Santiago",
    venue: "Calle Cualquiera 123",
    dateISO: "2026-06-20T21:00:00-03:00",
    image: "/events/noche-rock.jpg",
    hero: {
      desktop: "/banners/1400x450/noche-rock.jpg",
      mobile: "/banners/800x400/noche-rock.jpg",
    },
    description: `Bandas en vivo + energía de la buena.

Acceso por QR. +18.`,
    ticketTypes: [{ id: "tt_general", name: "Entrada General", priceCLP: 12000, maxPerOrder: 10 }],
  },
];

/* -----------------------------------------
   Helpers internos para resolver por API
------------------------------------------ */

function pickString(v: any) {
  return typeof v === "string" ? v.trim() : "";
}

function normalizeTicketType(raw: any): TicketType {
  // Soporta payloads típicos desde DB:
  // - id, name, price_clp, priceCLP
  // - max_per_order, maxPerOrder
  // - capacity, sold, held
  const id = pickString(raw?.id);
  const name = pickString(raw?.name);
  const priceCLP = Number(raw?.priceCLP ?? raw?.price_clp ?? raw?.price ?? 0);

  const tt: TicketType = {
    id,
    name,
    priceCLP: Number.isFinite(priceCLP) ? priceCLP : 0,
  };

  const maxPerOrder = raw?.maxPerOrder ?? raw?.max_per_order;
  const capacity = raw?.capacity;
  const sold = raw?.sold;
  const held = raw?.held;

  if (maxPerOrder !== undefined && maxPerOrder !== null) tt.maxPerOrder = Number(maxPerOrder);
  if (capacity !== undefined && capacity !== null) tt.capacity = Number(capacity);
  if (sold !== undefined && sold !== null) tt.sold = Number(sold);
  if (held !== undefined && held !== null) tt.held = Number(held);

  return tt;
}

function normalizeEvent(raw: any): Event | undefined {
  const id = pickString(raw?.id);
  const slug = pickString(raw?.slug);
  const title = pickString(raw?.title);
  const city = pickString(raw?.city);
  const venue = pickString(raw?.venue);
  const dateISO = pickString(raw?.dateISO ?? raw?.date_iso ?? raw?.date);
  const image = pickString(raw?.image);

  const description = pickString(raw?.description ?? "");
  const heroDesktop = pickString(raw?.hero?.desktop);
  const heroMobile = pickString(raw?.hero?.mobile);

  const ticketTypesRaw = Array.isArray(raw?.ticketTypes ?? raw?.ticket_types)
    ? (raw.ticketTypes ?? raw.ticket_types)
    : [];

  const ticketTypes = ticketTypesRaw.map(normalizeTicketType).filter((t: TicketType) => t.id && t.name);

  if (!id || !slug || !title || !city || !venue || !dateISO || !image) return undefined;
  if (!Array.isArray(ticketTypes) || ticketTypes.length === 0) return undefined;

  const ev: Event = {
    id,
    slug,
    title,
    city,
    venue,
    dateISO,
    image,
    description,
    ticketTypes,
  };

  if (heroDesktop && heroMobile) ev.hero = { desktop: heroDesktop, mobile: heroMobile };

  return ev;
}

async function fetchEventFromApi(path: string): Promise<Event | undefined> {
  // Funciona en server y en client (misma origin)
  try {
    const r = await fetch(path, { cache: "no-store" });
    if (!r.ok) return undefined;
    const data = await r.json().catch(() => null);
    if (!data) return undefined;
    return normalizeEvent(data);
  } catch {
    return undefined;
  }
}

/* -----------------------------------------
   Public API (modificada)
------------------------------------------ */

/**
 * ✅ Antes era sync y siempre devolvía el hardcode (EVENTS).
 * Ahora: intenta primero API (DB), y si no existe, cae al hardcode.
 *
 * OJO: si ya estabas importando getEventBySlug/getEventById en server components,
 * lo normal es que puedas usar "await getEventBySlug(...)" sin problema.
 */
export async function getEventBySlug(slug: string): Promise<Event | undefined> {
  const s = pickString(slug);
  if (!s) return undefined;

  // 1) Intento real (DB/API) — endpoints que vas a crear/usar
  // Si aún no existen, no rompe: cae al fallback.
  const fromApi =
    (await fetchEventFromApi(`/api/events/by-slug/${encodeURIComponent(s)}`)) ||
    (await fetchEventFromApi(`/api/events?slug=${encodeURIComponent(s)}`));

  if (fromApi) return fromApi;

  // 2) Fallback demo
  return EVENTS.find((e) => e.slug === s);
}

export async function getEventById(id: string): Promise<Event | undefined> {
  const s = pickString(id);
  if (!s) return undefined;

  // 1) Intento real (DB/API)
  const fromApi =
    (await fetchEventFromApi(`/api/events/${encodeURIComponent(s)}`)) ||
    (await fetchEventFromApi(`/api/events?id=${encodeURIComponent(s)}`));

  if (fromApi) return fromApi;

  // 2) Fallback demo
  return EVENTS.find((e) => e.id === s);
}

// formatea SOLO número (sin $) porque tu UI pone "$" afuera
export function formatCLP(value: number) {
  return new Intl.NumberFormat("es-CL").format(Number(value || 0));
}

function titleCaseEs(s: string) {
  // naive pero suficiente para labels
  return s.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}

export function formatEventDateLabel(dateISO: string) {
  const d = new Date(dateISO);
  const raw = d.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
  });
  return titleCaseEs(raw);
}

export function formatEventTimeLabel(dateISO: string) {
  const d = new Date(dateISO);
  const t = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit" });
  return `${t} hrs`;
}

export function parseCartString(cartString: string): Record<string, number> {
  const s = decodeURIComponent(String(cartString || "").trim());
  if (!s) return {};

  const cart: Record<string, number> = {};
  for (const item of s.split(",")) {
    const [ticketId, qtyRaw] = item.split(":");
    const qty = Number(qtyRaw);
    if (!ticketId) continue;
    if (!Number.isFinite(qty) || qty <= 0) continue;
    cart[ticketId] = Math.floor(qty);
  }
  return cart;
}

export function buildCartString(cart: Record<string, number>): string {
  return Object.entries(cart)
    .filter(([_, q]) => Number(q) > 0)
    .map(([id, q]) => `${id}:${Math.floor(Number(q))}`)
    .join(",");
}

// --- Compat helpers (para no romper imports antiguos) ---

export function remainingFor(tt: any) {
  const capRaw = tt?.capacity;
  if (capRaw === undefined || capRaw === null) return 999999;

  const cap = Number(capRaw);
  if (!Number.isFinite(cap) || cap <= 0) return 999999;

  const sold = Number(tt?.sold ?? 0);
  const held = Number(tt?.held ?? 0);
  return Math.max(0, cap - sold - held);
}

export function eventRemaining(event: any) {
  return (event?.ticketTypes ?? []).reduce((acc: number, tt: any) => acc + remainingFor(tt), 0);
}

export function eventIsSoldOut(event: any) {
  return eventRemaining(event) <= 0;
}

export function eventPriceFrom(event: any) {
  const tts = event?.ticketTypes ?? [];
  if (!tts.length) return 0;

  // Soporta ambos modelos: price / priceCLP
  const available = tts.filter((t: any) => remainingFor(t) > 0);
  const list = available.length ? available : tts;

  const prices = list
    .map((t: any) => Number(t?.priceCLP ?? t?.price ?? 0))
    .filter((n: number) => Number.isFinite(n));

  return prices.length ? Math.min(...prices) : 0;
}

// si tu bolt events.ts usa date/time como string, igual dejamos formateo ISO (cuando exista)
export function formatDateLong(dateISO: string) {
  const d = new Date(dateISO);
  return d.toLocaleString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function formatDateShort(dateISO: string) {
  const d = new Date(dateISO);
  return d.toLocaleString("es-CL", {
    weekday: "short",
    day: "2-digit",
    month: "short",
    hour: "2-digit",
    minute: "2-digit",
  });
}
