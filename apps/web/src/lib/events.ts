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
