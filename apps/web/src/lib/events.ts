// apps/web/src/lib/events.ts

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
  timezone?: string;
  endISO?: string;
  address?: string;
  agePolicy?: string;
  accessInfo?: string;
  faq?: string;

  // Poster vertical (cards + detalle)
  image: string;

  // ✅ Banner horizontal (desktop + mobile)
  hero?: {
    desktop: string;
    mobile: string;
  };

  description: string;
  ticketTypes: TicketType[];
  ended?: boolean;
  category?: string;
  categoryName?: string;
  organizerName?: string;
};

// formatea SOLO número (sin $) porque tu UI pone "$" afuera
export function formatCLP(value: number) {
  return new Intl.NumberFormat("es-CL").format(Number(value || 0));
}

function titleCaseEs(s: string) {
  return s.replace(/\b\p{L}/gu, (m) => m.toUpperCase());
}

export function formatEventDateLabel(dateISO: string) {
  const d = new Date(dateISO);
  const raw = d.toLocaleDateString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
  });
  return titleCaseEs(raw);
}

export function formatEventTimeLabel(dateISO: string) {
  const d = new Date(dateISO);
  const t = d.toLocaleTimeString("es-CL", { hour: "2-digit", minute: "2-digit", timeZone: "America/Santiago" });
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
    .filter(([, q]) => Number(q) > 0)
    .map(([id, q]) => `${id}:${Math.floor(Number(q))}`)
    .join(",");
}

// --- Compat helpers ---

export function remainingFor(tt: TicketType) {
  const capRaw = tt?.capacity;
  if (capRaw === undefined || capRaw === null) return 999999;

  const cap = Number(capRaw);
  if (!Number.isFinite(cap)) return 0;

  const sold = Number(tt?.sold ?? 0);
  const held = Number(tt?.held ?? 0);
  return Math.max(0, cap - sold - held);
}

export function eventRemaining(event: Event) {
  return (event?.ticketTypes ?? []).reduce((acc: number, tt: TicketType) => acc + remainingFor(tt), 0);
}

export function eventIsSoldOut(event: Event) {
  return eventRemaining(event) <= 0;
}

export function eventPriceFrom(event: Event) {
  const tts = event?.ticketTypes ?? [];
  if (!tts.length) return 0;

  const available = tts.filter((t: TicketType) => remainingFor(t) > 0);
  const list = available.length ? available : tts;

  const prices = list
    .map((t: TicketType) => Number(t.priceCLP ?? 0))
    .filter((n: number) => Number.isFinite(n));

  return prices.length ? Math.min(...prices) : 0;
}

export function formatDateLong(dateISO: string) {
  const d = new Date(dateISO);
  return d.toLocaleString("es-CL", {
    weekday: "long",
    day: "2-digit",
    month: "long",
    year: "numeric",
    timeZone: "America/Santiago",
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
