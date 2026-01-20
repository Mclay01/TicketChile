// apps/web/src/lib/demo-db.server.ts
import fs from "node:fs";
import path from "node:path";
import crypto from "node:crypto";

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
  ticketTypeId?: string; // <- nuevo (compat)
  ticketTypeName: string;
  buyerEmail: string;
  status: "VALID" | "USED";
  usedAtISO?: string;
};

export type HoldItem = {
  ticketTypeId: string;
  ticketTypeName: string;
  unitPriceCLP: number;
  qty: number;
};

export type Hold = {
  id: string;
  createdAtISO: string;
  expiresAtISO: string;
  eventId: string;
  status: "ACTIVE" | "CONSUMED" | "EXPIRED" | "CANCELED";
  items: HoldItem[];
};

type DB = {
  orders: Order[];
  tickets: Ticket[];
  holds: Hold[];
};

const DEMO_DIR = path.join(process.cwd(), ".demo");
const DB_PATH = path.join(DEMO_DIR, "db.json");

function ensureDir() {
  if (!fs.existsSync(DEMO_DIR)) fs.mkdirSync(DEMO_DIR, { recursive: true });
}

function safeParse(raw: string | null): DB {
  if (!raw) return { orders: [], tickets: [], holds: [] };
  try {
    const data = JSON.parse(raw);
    return {
      orders: Array.isArray(data?.orders) ? data.orders : [],
      tickets: Array.isArray(data?.tickets) ? data.tickets : [],
      holds: Array.isArray(data?.holds) ? data.holds : [],
    };
  } catch {
    return { orders: [], tickets: [], holds: [] };
  }
}

function readDB(): DB {
  ensureDir();
  if (!fs.existsSync(DB_PATH)) return { orders: [], tickets: [], holds: [] };
  const raw = fs.readFileSync(DB_PATH, "utf8");
  return safeParse(raw);
}

function writeDB(db: DB) {
  ensureDir();
  const tmp = DB_PATH + ".tmp";
  fs.writeFileSync(tmp, JSON.stringify(db, null, 2), "utf8");
  fs.renameSync(tmp, DB_PATH);
}

export function createId(prefix: string) {
  return `${prefix}_${Date.now().toString(36)}_${crypto.randomBytes(4).toString("hex")}`;
}

function nowISO() {
  return new Date().toISOString();
}

function purgeExpiredHolds(db: DB) {
  const now = Date.now();
  let changed = false;

  for (const h of db.holds) {
    if (h.status !== "ACTIVE") continue;
    const exp = Date.parse(h.expiresAtISO);
    if (Number.isFinite(exp) && exp <= now) {
      h.status = "EXPIRED";
      changed = true;
    }
  }

  if (changed) writeDB(db);
}

export function getTicketsServer(email?: string) {
  const db = readDB();
  purgeExpiredHolds(db);

  if (!email) return db.tickets;
  const q = email.toLowerCase();
  return db.tickets.filter((t) => (t.buyerEmail || "").toLowerCase() === q);
}

export function resetDemoServer() {
  writeDB({ orders: [], tickets: [], holds: [] });
}

export function getActiveHoldQtyForTicketType(eventId: string, ticketTypeId: string) {
  const db = readDB();
  purgeExpiredHolds(db);

  let total = 0;
  for (const h of db.holds) {
    if (h.status !== "ACTIVE") continue;
    if (h.eventId !== eventId) continue;
    for (const it of h.items) {
      if (it.ticketTypeId === ticketTypeId) total += it.qty;
    }
  }
  return total;
}

export function getSoldQtyForTicketType(eventId: string, ticketTypeId: string, ticketTypeName?: string) {
  const db = readDB();
  purgeExpiredHolds(db);

  // tickets VALID/USED cuentan como vendidos
  return db.tickets.reduce((acc, t) => {
    if (t.eventId !== eventId) return acc;
    if (t.ticketTypeId && t.ticketTypeId === ticketTypeId) return acc + 1;
    // compat con tickets viejos que no traen ticketTypeId
    if (!t.ticketTypeId && ticketTypeName && t.ticketTypeName === ticketTypeName) return acc + 1;
    return acc;
  }, 0);
}

export function createHoldServer(input: {
  eventId: string;
  items: HoldItem[];
  ttlSeconds?: number;
}) {
  const db = readDB();
  purgeExpiredHolds(db);

  const ttl = Math.max(60, input.ttlSeconds ?? 8 * 60); // mínimo 1 min
  const createdAtISO = nowISO();
  const expiresAtISO = new Date(Date.now() + ttl * 1000).toISOString();

  const hold: Hold = {
    id: createId("hold"),
    createdAtISO,
    expiresAtISO,
    eventId: input.eventId,
    status: "ACTIVE",
    items: input.items,
  };

  db.holds.unshift(hold);
  writeDB(db);

  return { hold };
}

export function consumeHoldToPaidOrderServer(input: {
  holdId: string;
  eventTitle: string;
  buyerName: string;
  buyerEmail: string;
}) {
  const db = readDB();
  purgeExpiredHolds(db);

  const hold = db.holds.find((h) => h.id === input.holdId);
  if (!hold) throw new Error("Hold no existe.");
  if (hold.status !== "ACTIVE") throw new Error(`Hold no está activo (${hold.status}).`);
  if (Date.parse(hold.expiresAtISO) <= Date.now()) {
    hold.status = "EXPIRED";
    writeDB(db);
    throw new Error("Hold expiró.");
  }

  const orderId = createId("ord");
  const items: OrderItem[] = hold.items.map((it) => ({ ...it }));
  const subtotalCLP = items.reduce((acc, it) => acc + it.unitPriceCLP * it.qty, 0);

  const order: Order = {
    id: orderId,
    createdAtISO: nowISO(),
    eventId: hold.eventId,
    eventTitle: input.eventTitle,
    buyerName: input.buyerName,
    buyerEmail: input.buyerEmail,
    subtotalCLP,
    status: "PAID",
    items,
  };

  const tickets: Ticket[] = [];
  for (const it of items) {
    for (let i = 0; i < it.qty; i++) {
      tickets.push({
        id: createId("tix"),
        orderId,
        eventId: hold.eventId,
        eventTitle: input.eventTitle,
        ticketTypeId: it.ticketTypeId,
        ticketTypeName: it.ticketTypeName,
        buyerEmail: input.buyerEmail,
        status: "VALID",
      });
    }
  }

  hold.status = "CONSUMED";
  db.orders.unshift(order);
  db.tickets.unshift(...tickets);
  writeDB(db);

  return { order, tickets };
}

export function setTicketUsedServer(ticketId: string, eventId: string) {
  const db = readDB();
  purgeExpiredHolds(db);

  const t = db.tickets.find((x) => x.id === ticketId);
  if (!t) throw new Error("Ticket no existe.");
  if (t.eventId !== eventId) throw new Error("Ticket no pertenece a este evento.");
  if (t.status === "USED") return { ticket: t, alreadyUsed: true };

  t.status = "USED";
  t.usedAtISO = nowISO();
  writeDB(db);

  return { ticket: t, alreadyUsed: false };
}

export function getSoldByTicketTypeIdServer(eventId: string): Record<string, number> {
  const db = readDB();
  purgeExpiredHolds(db);

  const map: Record<string, number> = {};
  for (const o of db.orders) {
    if (o.eventId !== eventId) continue;
    for (const it of o.items) {
      map[it.ticketTypeId] = (map[it.ticketTypeId] ?? 0) + it.qty;
    }
  }
  return map;
}

import { EVENTS } from "@/lib/events";

type TicketTypeAvail = {
  ticketTypeId: string;
  ticketTypeName: string;
  capacity: number;
  sold: number;
  held: number;
  remaining: number;
};

type EventAvail = {
  eventId: string;
  totals: {
    capacity: number;
    sold: number;
    held: number;
    remaining: number;
    used: number;
  };
  byType: TicketTypeAvail[];
  recentUsed: Array<{
    ticketId: string;
    ticketTypeName: string;
    buyerEmail: string;
    usedAtISO: string;
  }>;
  soldOut: boolean;
};

function getCapacity(tt: any): number {
  const n =
    tt?.capacity ??
    tt?.stock ??
    tt?.qty ??
    tt?.maxQty ??
    tt?.limit ??
    tt?.inventory ??
    0;
  const cap = Number(n);
  return Number.isFinite(cap) ? cap : 0;
}

function computeEventAvail(db: any, eventId: string): EventAvail {
  const ev = EVENTS.find((e) => e.id === eventId);
  if (!ev) {
    return {
      eventId,
      totals: { capacity: 0, sold: 0, held: 0, remaining: 0, used: 0 },
      byType: [],
      recentUsed: [],
      soldOut: true,
    };
  }

  // tickets vendidos + usados (cuentan como vendidos)
  const soldById: Record<string, number> = {};
  const soldByName: Record<string, number> = {};

  let used = 0;
  const recentUsed: EventAvail["recentUsed"] = [];

  for (const t of db.tickets as Ticket[]) {
    if (t.eventId !== eventId) continue;

    if (t.status === "USED") {
      used += 1;
      if (t.usedAtISO) {
        recentUsed.push({
          ticketId: t.id,
          ticketTypeName: t.ticketTypeName,
          buyerEmail: t.buyerEmail,
          usedAtISO: t.usedAtISO,
        });
      }
    }

    if (t.ticketTypeId) {
      soldById[t.ticketTypeId] = (soldById[t.ticketTypeId] ?? 0) + 1;
    } else {
      // compat tickets viejos sin ticketTypeId
      soldByName[t.ticketTypeName] = (soldByName[t.ticketTypeName] ?? 0) + 1;
    }
  }

  // holds activos
  const heldById: Record<string, number> = {};
  for (const h of db.holds as Hold[]) {
    if (h.status !== "ACTIVE") continue;
    if (h.eventId !== eventId) continue;

    for (const it of h.items) {
      heldById[it.ticketTypeId] = (heldById[it.ticketTypeId] ?? 0) + it.qty;
    }
  }

  recentUsed.sort((a, b) => (a.usedAtISO < b.usedAtISO ? 1 : -1));
  const recentUsedTop = recentUsed.slice(0, 10);

  const byType: TicketTypeAvail[] = ev.ticketTypes.map((tt: any) => {
    const capacity = getCapacity(tt);
    const sold =
      (soldById[tt.id] ?? 0) + (tt?.name ? soldByName[tt.name] ?? 0 : 0);
    const held = heldById[tt.id] ?? 0;
    const remaining = Math.max(0, capacity - sold - held);

    return {
      ticketTypeId: tt.id,
      ticketTypeName: tt.name,
      capacity,
      sold,
      held,
      remaining,
    };
  });

  const totals = byType.reduce(
    (acc, x) => {
      acc.capacity += x.capacity;
      acc.sold += x.sold;
      acc.held += x.held;
      acc.remaining += x.remaining;
      return acc;
    },
    { capacity: 0, sold: 0, held: 0, remaining: 0 }
  );

  return {
    eventId,
    totals: { ...totals, used },
    byType,
    recentUsed: recentUsedTop,
    soldOut: byType.every((x) => x.remaining <= 0),
  };
}

/** Para el checkout (mostrar stock real) */
export function getEventAvailabilityServer(eventId: string) {
  const db = readDB();
  purgeExpiredHolds(db);
  return computeEventAvail(db, eventId);
}

/** Para el dashboard del organizador (todos los eventos, 1 sola lectura del DB) */
export function getOrganizerDashboardStatsServer() {
  const db = readDB();
  purgeExpiredHolds(db);

  const out: Record<string, EventAvail> = {};
  for (const ev of EVENTS) out[ev.id] = computeEventAvail(db, ev.id);
  return out;
}

export function getEventStatsServer(eventId: string) {
  const db = readDB();
  purgeExpiredHolds(db);

  const tickets = db.tickets.filter((t) => t.eventId === eventId);
  const sold = tickets.length;

  let used = 0;
  for (const t of tickets) if (t.status === "USED") used++;

  return { sold, used, valid: sold - used };
}

export function getEventCheckinsServer(eventId: string) {
  const db = readDB();
  purgeExpiredHolds(db);

  return db.tickets
    .filter((t) => t.eventId === eventId && t.status === "USED")
    .sort((a, b) => (b.usedAtISO ?? "").localeCompare(a.usedAtISO ?? ""));
}

export function resetEventCheckinsServer(eventId: string) {
  const db = readDB();
  purgeExpiredHolds(db);

  let changed = false;
  for (const t of db.tickets) {
    if (t.eventId !== eventId) continue;
    if (t.status !== "USED") continue;
    t.status = "VALID";
    delete t.usedAtISO;
    changed = true;
  }

  if (changed) writeDB(db);
  return { ok: true, changed };
}

export function exportEventTicketsCsvServer(eventId: string) {
  const db = readDB();
  purgeExpiredHolds(db);

  const rows = db.tickets.filter((t) => t.eventId === eventId);

  const header = [
    "ticketId",
    "orderId",
    "eventId",
    "eventTitle",
    "ticketTypeId",
    "ticketTypeName",
    "buyerEmail",
    "status",
    "usedAtISO",
  ].join(",");

  const esc = (v: any) => {
    const s = String(v ?? "");
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };

  const lines = rows.map((t) =>
    [
      t.id,
      t.orderId,
      t.eventId,
      t.eventTitle,
      t.ticketTypeId ?? "",
      t.ticketTypeName,
      t.buyerEmail,
      t.status,
      t.usedAtISO ?? "",
    ]
      .map(esc)
      .join(",")
  );

  return [header, ...lines].join("\n");
}

export function getHoldServer(holdId: string) {
  const db = readDB();
  purgeExpiredHolds(db);
  return db.holds.find((h) => h.id === holdId) ?? null;
}

function getQtyFromHold(hold: Hold, ticketTypeId: string) {
  return hold.items.reduce((acc, it) => acc + (it.ticketTypeId === ticketTypeId ? it.qty : 0), 0);
}

export function upsertHoldServer(input: {
  holdId?: string;
  eventId: string;
  items: HoldItem[];
  ttlSeconds?: number;
}) {
  const db = readDB();
  purgeExpiredHolds(db);

  const ttl = Math.max(60, input.ttlSeconds ?? 8 * 60);
  const now = Date.now();
  const createdAtISO = nowISO();
  const expiresAtISO = new Date(now + ttl * 1000).toISOString();

  // Si viene holdId, intentamos actualizarlo
  if (input.holdId) {
    const h = db.holds.find((x) => x.id === input.holdId);
    if (
      h &&
      h.status === "ACTIVE" &&
      h.eventId === input.eventId &&
      Date.parse(h.expiresAtISO) > now
    ) {
      h.items = input.items;
      h.expiresAtISO = expiresAtISO;
      writeDB(db);
      return { hold: h, reused: true };
    }
  }

  // Si no existe / expiró / no sirve -> creamos uno nuevo
  const hold: Hold = {
    id: createId("hold"),
    createdAtISO,
    expiresAtISO,
    eventId: input.eventId,
    status: "ACTIVE",
    items: input.items,
  };

  db.holds.unshift(hold);
  writeDB(db);
  return { hold, reused: false };
}

export function releaseHoldServer(holdId: string) {
  const db = readDB();
  purgeExpiredHolds(db);

  const h = db.holds.find((x) => x.id === holdId);
  if (!h) return { ok: true, released: false };

  if (h.status !== "ACTIVE") return { ok: true, released: false };

  h.status = "CANCELED";
  h.expiresAtISO = nowISO();
  writeDB(db);

  return { ok: true, released: true };
}

/**
 * Para validar stock al actualizar un hold: “held” total del tipo EXCLUYENDO este hold.
 */
export function getActiveHoldQtyForTicketTypeExcludingHold(
  eventId: string,
  ticketTypeId: string,
  excludeHoldId?: string
) {
  const db = readDB();
  purgeExpiredHolds(db);

  let total = 0;
  for (const h of db.holds) {
    if (h.status !== "ACTIVE") continue;
    if (h.eventId !== eventId) continue;
    if (excludeHoldId && h.id === excludeHoldId) continue;

    for (const it of h.items) {
      if (it.ticketTypeId === ticketTypeId) total += it.qty;
    }
  }
  return total;
}

export function getQtyForTicketTypeInHoldServer(holdId: string, ticketTypeId: string) {
  const h = getHoldServer(holdId);
  if (!h || h.status !== "ACTIVE") return 0;
  return getQtyFromHold(h, ticketTypeId);
}
