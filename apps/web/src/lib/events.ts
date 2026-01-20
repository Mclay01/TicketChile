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
  image: string;
  description: string;
  ticketTypes: TicketType[];
};

export const EVENTS: Event[] = [
  {
    id: "evt_001",
    slug: "techno-noche-santiago",
    title: "Techno Noche Santiago",
    city: "Santiago",
    venue: "Centro X",
    dateISO: "2026-01-17T23:00:00-03:00",
    image:
      "https://images.pexels.com/photos/1763075/pexels-photo-1763075.jpeg?auto=compress&cs=tinysrgb&w=900",
    description: `Una noche de techno con visuales inmersivos y sonido de verdad (del que te vibra el pecho, no el del parlante Bluetooth).

Line-up: DJs invitados + warm-up local. Producción con luces, pantallas y barra completa.

Acceso por QR. +18. Cupos limitados.`,
    ticketTypes: [
      { id: "tt_preventa", name: "Preventa", priceCLP: 15000, maxPerOrder: 10 },
      { id: "tt_general", name: "General", priceCLP: 20000, maxPerOrder: 10 },
      { id: "tt_vip", name: "VIP", priceCLP: 35000, maxPerOrder: 6 },
    ],
  },
  {
    id: "evt_002",
    slug: "urbano-vibes-valpo",
    title: "Urbano Vibes",
    city: "Valparaíso",
    venue: "Muelle Barón",
    dateISO: "2026-02-02T20:00:00-03:00",
    image:
      "https://images.pexels.com/photos/1105666/pexels-photo-1105666.jpeg?auto=compress&cs=tinysrgb&w=900",
    description: `Reggaetón, urbano y hits para cantar a grito pelado (con dignidad… o sin ella).

Acceso por QR, control rápido en puerta y ambiente frente al mar.

+18. Producción full y barras activas toda la noche.`,
    ticketTypes: [
      { id: "tt_preventa", name: "Preventa", priceCLP: 12000, maxPerOrder: 10 },
      { id: "tt_general", name: "General", priceCLP: 16000, maxPerOrder: 10 },
      { id: "tt_vip", name: "VIP", priceCLP: 30000, maxPerOrder: 6 },
    ],
  },
  {
    id: "evt_003",
    slug: "festival-summer-chile",
    title: "Festival Summer Chile",
    city: "Viña del Mar",
    venue: "Quinta Vergara",
    dateISO: "2026-02-15T18:00:00-03:00",
    image:
      "https://images.pexels.com/photos/167636/pexels-photo-167636.jpeg?auto=compress&cs=tinysrgb&w=900",
    description: `Festival al aire libre con shows en vivo, foodtrucks y zonas de descanso.

Entrada por QR. Check-in en puerta. Producción pensada para que lo pases bien sin filas eternas.

Cupos limitados. Preventa disponible hasta agotar stock.`,
    ticketTypes: [
      { id: "tt_preventa", name: "Preventa", priceCLP: 25000, maxPerOrder: 10 },
      { id: "tt_general", name: "General", priceCLP: 32000, maxPerOrder: 10 },
      { id: "tt_vip", name: "VIP", priceCLP: 60000, maxPerOrder: 6 },
    ],
  },
];

export function getEventBySlug(slug: string): Event | undefined {
  return EVENTS.find((e) => e.slug === slug);
}

export function getEventById(id: string): Event | undefined {
  return EVENTS.find((e) => e.id === id);
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

  const prices = list.map((t: any) => Number(t?.priceCLP ?? t?.price ?? 0)).filter((n: number) => Number.isFinite(n));
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
