// apps/web/src/lib/organizer.pg.server.ts
import { pool } from "@/lib/db";

export type DashboardStats = {
  totals: {
    capacity: number;
    sold: number;
    remaining: number;
    held: number;
    used: number;
    pending: number;
  };
  byType: Array<{
    ticketTypeId: string;
    ticketTypeName: string;
    capacity: number;
    sold: number;
    held: number;
    remaining: number;
    pending: number;
    used: number;
  }>;
  recentUsed: Array<{
    ticketId: string;
    ticketTypeName: string;
    buyerEmail: string;
    usedAtISO: string | null;
  }>;

  payments: {
    totals: {
      created: number;
      pending: number;
      paid: number;
      failed: number;
      cancelled: number;
      other: number;

      amountPaidClp: number;
      amountPendingClp: number;
    };
    recent: Array<{
      paymentId: string;
      provider: string;
      providerRef: string | null;
      buyerEmail: string;
      buyerName: string;
      amountClp: number;
      currency: string;
      status: string;
      createdAtISO: string;
      updatedAtISO: string;
      paidAtISO: string | null;
      holdId: string;
      orderId: string | null;
    }>;
  };
};

function normalizeStatus(s: unknown) {
  return String(s ?? "").trim().toUpperCase();
}

function ensureEvent(byEvent: Record<string, DashboardStats>, eventId: string) {
  if (!byEvent[eventId]) {
    byEvent[eventId] = {
      totals: { capacity: 0, sold: 0, remaining: 0, held: 0, used: 0, pending: 0 },
      byType: [],
      recentUsed: [],
      payments: {
        totals: {
          created: 0,
          pending: 0,
          paid: 0,
          failed: 0,
          cancelled: 0,
          other: 0,
          amountPaidClp: 0,
          amountPendingClp: 0,
        },
        recent: [],
      },
    };
  } else if (!byEvent[eventId].payments) {
    byEvent[eventId].payments = {
      totals: {
        created: 0,
        pending: 0,
        paid: 0,
        failed: 0,
        cancelled: 0,
        other: 0,
        amountPaidClp: 0,
        amountPendingClp: 0,
      },
      recent: [],
    };
  }
}

/* =========================================
   EVENTOS POR ORGANIZADOR (PG)
   ========================================= */

export type OrganizerEvent = {
  id: string;
  slug: string;
  title: string;
  city: string;
  venue: string;
  dateISO: string;
  image: string;
  priceFromClp: number;
};

type OrganizerEventRow = {
  id: string;
  slug: string;
  title: string;
  city: string;
  venue: string;
  date_iso: Date;
  image: string;
  price_from_clp: number | null;
};

export async function listOrganizerEventsPgServer(organizerId: string): Promise<OrganizerEvent[]> {
  const orgId = String(organizerId || "").trim();
  if (!orgId) return [];

  const r = await pool.query<OrganizerEventRow>(
    `
    SELECT
      e.id,
      e.slug,
      e.title,
      e.city,
      e.venue,
      e.date_iso,
      e.image,
      (
        SELECT MIN(tt.price_clp)::int
        FROM ticket_types tt
        WHERE tt.event_id = e.id
      ) AS price_from_clp
    FROM organizer_events oe
    JOIN events e ON e.id = oe.event_id
    WHERE oe.organizer_id = $1
    ORDER BY e.date_iso DESC
    `,
    [orgId]
  );

  return r.rows.map((x) => ({
    id: String(x.id),
    slug: String(x.slug),
    title: String(x.title),
    city: String(x.city),
    venue: String(x.venue),
    dateISO: x.date_iso ? new Date(x.date_iso).toISOString() : new Date().toISOString(),
    image: String(x.image || "/events/default.jpg"),
    priceFromClp: Number(x.price_from_clp ?? 0) || 0,
  }));
}

/* =========================================
   STATS POR ORGANIZADOR (PG)
   ========================================= */

type TicketTypeRow = {
  event_id: string;
  ticketTypeId: string;
  ticketTypeName: string;
  capacity: number;
  sold: number;
  held: number;
  remaining: number;
};

type StatusRow = {
  event_id: string;
  ticket_type_id: string;
  pending: number;
  used: number;
};

type RecentUsedRow = {
  event_id: string;
  ticketId: string;
  ticketTypeName: string;
  buyerEmail: string;
  used_at: Date | null;
};

type PaymentAggRow = {
  event_id: string;
  status: string;
  count: number;
  amount: number;
};

type PaymentRecentRow = {
  event_id: string;
  paymentId: string;
  provider: string;
  providerRef: string | null;
  buyerEmail: string;
  buyerName: string;
  amountClp: number;
  currency: string;
  status: string;
  created_at: Date;
  updated_at: Date;
  paid_at: Date | null;
  holdId: string;
  orderId: string | null;
};

export async function getOrganizerDashboardStatsPgServer(
  organizerId: string
): Promise<Record<string, DashboardStats>> {
  const orgId = String(organizerId || "").trim();
  if (!orgId) return {};

  // 1) ticket_types SOLO eventos del organizador
  const tt = await pool.query<TicketTypeRow>(
    `
    SELECT
      tt.event_id,
      tt.id AS "ticketTypeId",
      tt.name AS "ticketTypeName",
      tt.capacity::int AS "capacity",
      tt.sold::int AS "sold",
      tt.held::int AS "held",
      GREATEST(tt.capacity - tt.sold - tt.held, 0)::int AS "remaining"
    FROM ticket_types tt
    WHERE tt.event_id IN (
      SELECT event_id FROM organizer_events WHERE organizer_id = $1
    )
    ORDER BY tt.event_id, tt.name ASC
    `,
    [orgId]
  );

  // 2) tickets pending/used por tipo (solo eventos del organizador)
  const status = await pool.query<StatusRow>(
    `
    SELECT
      event_id,
      ticket_type_id,
      COUNT(*) FILTER (WHERE status='VALID')::int AS pending,
      COUNT(*) FILTER (WHERE status='USED')::int AS used
    FROM tickets
    WHERE event_id IN (
      SELECT event_id FROM organizer_events WHERE organizer_id = $1
    )
    GROUP BY event_id, ticket_type_id
    `,
    [orgId]
  );

  // 3) recientes USED (solo eventos del organizador)
  const recent = await pool.query<RecentUsedRow>(
    `
    SELECT
      event_id,
      id AS "ticketId",
      ticket_type_name AS "ticketTypeName",
      buyer_email AS "buyerEmail",
      used_at
    FROM tickets
    WHERE status='USED'
      AND event_id IN (
        SELECT event_id FROM organizer_events WHERE organizer_id = $1
      )
    ORDER BY used_at DESC
    LIMIT 200
    `,
    [orgId]
  );

  const statusKey = new Map<string, { pending: number; used: number }>();
  for (const r of status.rows) {
    statusKey.set(`${r.event_id}:${r.ticket_type_id}`, {
      pending: r.pending ?? 0,
      used: r.used ?? 0,
    });
  }

  const byEvent: Record<string, DashboardStats> = {};

  for (const r of tt.rows) {
    const st = statusKey.get(`${r.event_id}:${r.ticketTypeId}`) ?? { pending: 0, used: 0 };

    ensureEvent(byEvent, r.event_id);

    byEvent[r.event_id].byType.push({
      ticketTypeId: r.ticketTypeId,
      ticketTypeName: r.ticketTypeName,
      capacity: r.capacity,
      sold: r.sold,
      held: r.held,
      remaining: r.remaining,
      pending: st.pending,
      used: st.used,
    });

    byEvent[r.event_id].totals.capacity += r.capacity;
    byEvent[r.event_id].totals.sold += r.sold;
    byEvent[r.event_id].totals.held += r.held;
    byEvent[r.event_id].totals.remaining += r.remaining;
    byEvent[r.event_id].totals.used += st.used;
    byEvent[r.event_id].totals.pending += st.pending;
  }

  // recientes por evento
  const maxRecentPerEvent = 12;
  const recentCount: Record<string, number> = {};

  for (const r of recent.rows) {
    if (!byEvent[r.event_id]) continue;

    recentCount[r.event_id] = (recentCount[r.event_id] ?? 0) + 1;
    if (recentCount[r.event_id] > maxRecentPerEvent) continue;

    byEvent[r.event_id].recentUsed.push({
      ticketId: r.ticketId,
      ticketTypeName: r.ticketTypeName,
      buyerEmail: r.buyerEmail,
      usedAtISO: r.used_at ? new Date(r.used_at).toISOString() : null,
    });
  }

  // 4) pagos agregados por evento/estado (solo eventos del organizador)
  const payAgg = await pool.query<PaymentAggRow>(
    `
    SELECT
      event_id,
      UPPER(status) AS status,
      COUNT(*)::int AS count,
      COALESCE(SUM(amount_clp),0)::int AS amount
    FROM payments
    WHERE event_id IN (
      SELECT event_id FROM organizer_events WHERE organizer_id = $1
    )
    GROUP BY event_id, UPPER(status)
    `,
    [orgId]
  );

  for (const r of payAgg.rows) {
    const ev = String(r.event_id);
    ensureEvent(byEvent, ev);

    const st = normalizeStatus(r.status);
    const c = Number(r.count ?? 0) || 0;
    const amt = Number(r.amount ?? 0) || 0;

    const t = byEvent[ev].payments.totals;

    if (st === "PAID") {
      t.paid += c;
      t.amountPaidClp += amt;
    } else if (st === "PENDING") {
      t.pending += c;
      t.amountPendingClp += amt;
    } else if (st === "CREATED") {
      t.created += c;
      t.amountPendingClp += amt;
    } else if (st === "FAILED") {
      t.failed += c;
    } else if (st === "CANCELLED") {
      t.cancelled += c;
    } else {
      t.other += c;
    }
  }

  // 5) pagos recientes
  const payRecent = await pool.query<PaymentRecentRow>(
    `
    SELECT
      event_id,
      id AS "paymentId",
      provider,
      provider_ref AS "providerRef",
      buyer_email AS "buyerEmail",
      buyer_name AS "buyerName",
      amount_clp AS "amountClp",
      currency,
      status,
      created_at,
      updated_at,
      paid_at,
      hold_id AS "holdId",
      order_id AS "orderId"
    FROM payments
    WHERE event_id IN (
      SELECT event_id FROM organizer_events WHERE organizer_id = $1
    )
    ORDER BY created_at DESC
    LIMIT 200
    `,
    [orgId]
  );

  const maxRecentPaymentsPerEvent = 8;
  const payCount: Record<string, number> = {};

  for (const r of payRecent.rows) {
    const ev = String(r.event_id);
    if (!byEvent[ev]) continue;

    payCount[ev] = (payCount[ev] ?? 0) + 1;
    if (payCount[ev] > maxRecentPaymentsPerEvent) continue;

    byEvent[ev].payments.recent.push({
      paymentId: String(r.paymentId),
      provider: String(r.provider || ""),
      providerRef: r.providerRef ? String(r.providerRef) : null,
      buyerEmail: String(r.buyerEmail || ""),
      buyerName: String(r.buyerName || ""),
      amountClp: Number(r.amountClp ?? 0) || 0,
      currency: String(r.currency || "CLP"),
      status: normalizeStatus(r.status),
      createdAtISO: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
      updatedAtISO: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
      paidAtISO: r.paid_at ? new Date(r.paid_at).toISOString() : null,
      holdId: String(r.holdId || ""),
      orderId: r.orderId ? String(r.orderId) : null,
    });
  }

  return byEvent;
}