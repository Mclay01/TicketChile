export type OrderItem = {
  ticketTypeId: string;
  ticketTypeName: string;
  unitPriceCLP: number;
  qty: number;
};

export type Order = {
  id: string;
  createdAtISO: string;
  eventId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  subtotalCLP: number;
  status: "PAID";
  items: OrderItem[];
};

export type Ticket = {
  id: string;
  orderId: string;
  eventId: string;
  eventTitle: string;
  ticketTypeName: string;
  buyerEmail: string;
  status: "VALID" | "USED" | "CANCELLED";
};


// =====================================================
// Local fallback (por si la API no responde)
// =====================================================
const KEY = "ticketchile:v1";

type LocalDB = {
  orders: Order[];
  tickets: Ticket[];
};

function safeParse(json: string | null): LocalDB {
  if (!json) return { orders: [], tickets: [] };
  try {
    const data = JSON.parse(json) as LocalDB;
    return {
      orders: Array.isArray(data.orders) ? data.orders : [],
      tickets: Array.isArray(data.tickets) ? data.tickets : [],
    };
  } catch {
    return { orders: [], tickets: [] };
  }
}

function loadLocal(): LocalDB {
  if (typeof window === "undefined") return { orders: [], tickets: [] };
  return safeParse(window.localStorage.getItem(KEY));
}

function saveLocal(db: LocalDB) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(KEY, JSON.stringify(db));
}

export function createId(prefix: string) {
  // suficientemente único para demo
  return `${prefix}_${Date.now().toString(36)}_${Math.random()
    .toString(36)
    .slice(2, 8)}`;
}

function createPaidOrderLocal(input: {
  eventId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  items: OrderItem[];
  subtotalCLP: number;
}) {
  const db = loadLocal();

  const orderId = createId("ord");
  const order: Order = {
    id: orderId,
    createdAtISO: new Date().toISOString(),
    eventId: input.eventId,
    eventTitle: input.eventTitle,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    subtotalCLP: input.subtotalCLP,
    status: "PAID",
    items: input.items,
  };

  const tickets: Ticket[] = [];
  for (const item of input.items) {
    for (let i = 0; i < item.qty; i++) {
      tickets.push({
        id: createId("tix"),
        orderId,
        eventId: input.eventId,
        eventTitle: input.eventTitle,
        ticketTypeName: item.ticketTypeName,
        buyerEmail: input.buyerEmail,
        status: "VALID",
      });
    }
  }

  db.orders.unshift(order);
  db.tickets.unshift(...tickets);
  saveLocal(db);

  return { order, tickets };
}

function getMyTicketsLocal(email?: string) {
  const db = loadLocal();
  if (!email) return db.tickets;
  return db.tickets.filter(
    (t) => t.buyerEmail.toLowerCase() === email.toLowerCase()
  );
}

// =====================================================
// Server demo API (compartido entre PC y móvil)
// =====================================================
async function apiJSON<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      "content-type": "application/json",
      ...(init?.headers ?? {}),
    },
  });

  if (!res.ok) {
    const msg = await res.text().catch(() => "");
    throw new Error(`API ${res.status}: ${msg || res.statusText}`);
  }
  return (await res.json()) as T;
}

/**
 * Crea una orden pagada en el "backend demo" (JSON local).
 * Si falla, cae a localStorage.
 */
export async function createPaidOrder(input: {
  eventId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
  items: OrderItem[];
  subtotalCLP: number;
}) {
  // En SSR no tiene sentido, esto se usa desde client actions
  try {
    return await apiJSON<{ order: Order; tickets: Ticket[] }>(
      "/api/demo/paid-order",
      { method: "POST", body: JSON.stringify(input) }
    );
  } catch {
    return createPaidOrderLocal(input);
  }
}

/**
 * Trae tickets desde el backend demo (compartido).
 * Si falla, cae a localStorage.
 */
export async function getMyTickets(email?: string) {
  try {
    const qs = email ? `?email=${encodeURIComponent(email)}` : "";
    return await apiJSON<Ticket[]>(`/api/demo/tickets${qs}`, { method: "GET" });
  } catch {
    return getMyTicketsLocal(email);
  }
}

/**
 * Borra demo en backend (y también local fallback).
 */
export async function clearDemoData() {
  if (typeof window !== "undefined") {
    window.localStorage.removeItem(KEY);
  }
  try {
    await apiJSON<{ ok: true }>("/api/demo/reset", { method: "POST" });
  } catch {
    // si falla, al menos se borró local
  }
}

// =====================================================
// CHECK-INS (scanner) - se mantiene local (por ahora)
// =====================================================
const CHECKINS_KEY = "ticketchile_demo_checkins_v1";

export type TicketCheckin = {
  ticketId: string;
  eventId: string;
  usedAt: string; // ISO
};

function readCheckins(): Record<string, TicketCheckin> {
  if (typeof window === "undefined") return {};
  try {
    const raw = localStorage.getItem(CHECKINS_KEY);
    if (!raw) return {};
    const obj = JSON.parse(raw);
    return obj && typeof obj === "object" ? obj : {};
  } catch {
    return {};
  }
}

function writeCheckins(map: Record<string, TicketCheckin>) {
  if (typeof window === "undefined") return;
  localStorage.setItem(CHECKINS_KEY, JSON.stringify(map));
}

export function getCheckin(ticketId: string): TicketCheckin | null {
  const all = readCheckins();
  return all[ticketId] ?? null;
}

export function setCheckedIn(ticketId: string, eventId: string, usedAtISO: string) {
  const all = readCheckins();
  all[ticketId] = { ticketId, eventId, usedAt: usedAtISO };
  writeCheckins(all);
}

export function getEventCheckins(eventId: string): TicketCheckin[] {
  const all = Object.values(readCheckins());
  return all
    .filter((c) => c.eventId === eventId)
    .sort((a, b) => (a.usedAt < b.usedAt ? 1 : -1));
}

export function clearEventCheckins(eventId: string) {
  const all = readCheckins();
  for (const [k, v] of Object.entries(all)) {
    if (v.eventId === eventId) delete all[k];
  }
  writeCheckins(all);
}
