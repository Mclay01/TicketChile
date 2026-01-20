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

  // ✅ NUEVO: pagos por evento
  payments: {
    totals: {
      created: number;
      pending: number;
      paid: number;
      failed: number;
      cancelled: number;
      other: number;

      amountPaidClp: number;
      amountPendingClp: number; // CREATED+PENDING
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

// ✅ pagos: agregados por evento/estado
type PaymentAggRow = {
  event_id: string;
  status: string;
  count: number;
  amount: number;
};

// ✅ pagos: recientes
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

export async function getOrganizerDashboardStatsPgServer(): Promise<Record<string, DashboardStats>> {
  // 1) ticket_types: counters canon
  const tt = await pool.query<TicketTypeRow>(`
    SELECT
      tt.event_id,
      tt.id AS "ticketTypeId",
      tt.name AS "ticketTypeName",
      tt.capacity::int AS "capacity",
      tt.sold::int AS "sold",
      tt.held::int AS "held",
      GREATEST(tt.capacity - tt.sold - tt.held, 0)::int AS "remaining"
    FROM ticket_types tt
    ORDER BY tt.event_id, tt.name ASC
  `);

  // 2) tickets: pending/used por tipo
  const status = await pool.query<StatusRow>(`
    SELECT
      event_id,
      ticket_type_id,
      COUNT(*) FILTER (WHERE status='VALID')::int AS pending,
      COUNT(*) FILTER (WHERE status='USED')::int AS used
    FROM tickets
    GROUP BY event_id, ticket_type_id
  `);

  // 3) recientes: global y luego cap por evento
  const recent = await pool.query<RecentUsedRow>(`
    SELECT
      event_id,
      id AS "ticketId",
      ticket_type_name AS "ticketTypeName",
      buyer_email AS "buyerEmail",
      used_at
    FROM tickets
    WHERE status='USED'
    ORDER BY used_at DESC
    LIMIT 200
  `);

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

  // recientes por evento (máx 12 por evento)
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

  /* =========================
     ✅ DASHBOARD PAGOS
     ========================= */

  // 4) pagos agregados por evento/estado
  const payAgg = await pool.query<PaymentAggRow>(`
    SELECT
      event_id,
      UPPER(status) AS status,
      COUNT(*)::int AS count,
      COALESCE(SUM(amount_clp),0)::int AS amount
    FROM payments
    WHERE event_id IS NOT NULL AND event_id <> ''
    GROUP BY event_id, UPPER(status)
  `);

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

  // 5) pagos recientes (cap 8 por evento)
  const payRecent = await pool.query<PaymentRecentRow>(`
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
    WHERE event_id IS NOT NULL AND event_id <> ''
    ORDER BY created_at DESC
    LIMIT 200
  `);

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

/* =========================
   EXPORT CSV (Paso 6 PRO)
   - JOIN orders (buyerName/eventTitle)
   - filtros: status / ticketTypeId
   - rango fechas (from/to)
   - elegir campo fecha: createdAt o usedAt
   - BOM para Excel
   - anti CSV injection (=,+,-,@)
   ========================= */

type ExportTicketsCsvOptions = {
  eventId: string;
  status?: "ALL" | "VALID" | "USED";
  ticketTypeId?: string;

  // rango opcional (ISO o YYYY-MM-DD)
  fromISO?: string;
  toISO?: string;

  // por defecto filtra por created_at
  dateField?: "createdAt" | "usedAt";

  includeBom?: boolean; // default true
};

function csvEscapeCell(v: unknown) {
  let s = String(v ?? "");

  // Anti CSV/Excel injection
  if (/^[=+\-@]/.test(s)) s = "'" + s;

  if (/[,"\r\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function parseOptionalDate(input?: string) {
  const s = String(input ?? "").trim();
  if (!s) return null;
  const d = new Date(s);
  return Number.isFinite(d.getTime()) ? d : null;
}

export async function exportTicketsCsvPgServer(opts: ExportTicketsCsvOptions): Promise<string> {
  const eventId = String(opts.eventId ?? "").trim();
  if (!eventId) throw new Error("Falta eventId.");

  const status = (opts.status ?? "ALL").toUpperCase() as "ALL" | "VALID" | "USED";
  const ticketTypeId = String(opts.ticketTypeId ?? "").trim();
  const includeBom = opts.includeBom ?? true;

  const dateField = opts.dateField ?? "createdAt";
  const from = parseOptionalDate(opts.fromISO);
  const to = parseOptionalDate(opts.toISO);

  const where: string[] = ["t.event_id = $1"];
  const params: any[] = [eventId];
  let p = 2;

  if (status !== "ALL") {
    where.push(`t.status = $${p++}`);
    params.push(status);
  }

  if (ticketTypeId) {
    where.push(`t.ticket_type_id = $${p++}`);
    params.push(ticketTypeId);
  }

  // rango por created_at o used_at
  const fieldSql = dateField === "usedAt" ? "t.used_at" : "t.created_at";

  if (from) {
    where.push(`${fieldSql} >= $${p++}`);
    params.push(from.toISOString());
  }
  if (to) {
    where.push(`${fieldSql} <= $${p++}`);
    params.push(to.toISOString());
  }

  // Si filtras por usedAt, conviene exigir used_at NOT NULL (evita filas “raras”)
  if (dateField === "usedAt") {
    where.push(`t.used_at IS NOT NULL`);
  }

  const sql = `
    SELECT
      t.id AS "ticketId",
      t.event_id AS "eventId",
      COALESCE(o.event_title, '') AS "eventTitle",
      t.ticket_type_id AS "ticketTypeId",
      t.ticket_type_name AS "ticketTypeName",
      COALESCE(o.buyer_name, '') AS "buyerName",
      t.buyer_email AS "buyerEmail",
      t.status AS "status",
      t.created_at AS "createdAt",
      t.used_at AS "usedAt",
      t.order_id AS "orderId",
      COALESCE(o.hold_id, '') AS "holdId"
    FROM tickets t
    LEFT JOIN orders o ON o.id = t.order_id
    WHERE ${where.join(" AND ")}
    ORDER BY t.created_at ASC
  `;

  const r = await pool.query(sql, params);

  const header = [
    "ticketId",
    "eventId",
    "eventTitle",
    "ticketTypeId",
    "ticketTypeName",
    "buyerName",
    "buyerEmail",
    "status",
    "createdAtISO",
    "usedAtISO",
    "orderId",
    "holdId",
  ].join(",");

  const lines = r.rows.map((t: any) => {
    const createdAtISO = t.createdAt ? new Date(t.createdAt).toISOString() : "";
    const usedAtISO = t.usedAt ? new Date(t.usedAt).toISOString() : "";
    return [
      csvEscapeCell(t.ticketId),
      csvEscapeCell(t.eventId),
      csvEscapeCell(t.eventTitle),
      csvEscapeCell(t.ticketTypeId),
      csvEscapeCell(t.ticketTypeName),
      csvEscapeCell(t.buyerName),
      csvEscapeCell(t.buyerEmail),
      csvEscapeCell(t.status),
      csvEscapeCell(createdAtISO),
      csvEscapeCell(usedAtISO),
      csvEscapeCell(t.orderId ?? ""),
      csvEscapeCell(t.holdId ?? ""),
    ].join(",");
  });

  const bom = includeBom ? "\ufeff" : "";
  return bom + [header, ...lines].join("\r\n");
}

/* =========================
   EXPORT CHECKINS CSV
   - Solo USED
   - ordenado por used_at desc
   - rango de fechas sobre used_at (from/to)
   ========================= */

export async function exportCheckinsCsvPgServer(opts: {
  eventId: string;
  fromISO?: string;
  toISO?: string;
  ticketTypeId?: string;
  includeBom?: boolean;
}): Promise<string> {
  const eventId = String(opts.eventId ?? "").trim();
  if (!eventId) throw new Error("Falta eventId.");

  const ticketTypeId = String(opts.ticketTypeId ?? "").trim();
  const includeBom = opts.includeBom ?? true;

  const from = parseOptionalDate(opts.fromISO);
  const to = parseOptionalDate(opts.toISO);

  const where: string[] = ["t.event_id = $1", "t.status = 'USED'", "t.used_at IS NOT NULL"];
  const params: any[] = [eventId];
  let p = 2;

  if (ticketTypeId) {
    where.push(`t.ticket_type_id = $${p++}`);
    params.push(ticketTypeId);
  }
  if (from) {
    where.push(`t.used_at >= $${p++}`);
    params.push(from.toISOString());
  }
  if (to) {
    where.push(`t.used_at <= $${p++}`);
    params.push(to.toISOString());
  }

  const sql = `
    SELECT
      t.id AS "ticketId",
      t.event_id AS "eventId",
      COALESCE(o.event_title, '') AS "eventTitle",
      t.ticket_type_id AS "ticketTypeId",
      t.ticket_type_name AS "ticketTypeName",
      COALESCE(o.buyer_name, '') AS "buyerName",
      t.buyer_email AS "buyerEmail",
      t.used_at AS "usedAt"
    FROM tickets t
    LEFT JOIN orders o ON o.id = t.order_id
    WHERE ${where.join(" AND ")}
    ORDER BY t.used_at DESC
  `;

  const r = await pool.query(sql, params);

  const header = [
    "ticketId",
    "eventId",
    "eventTitle",
    "ticketTypeId",
    "ticketTypeName",
    "buyerName",
    "buyerEmail",
    "usedAtISO",
  ].join(",");

  const lines = r.rows.map((t: any) => {
    const usedAtISO = t.usedAt ? new Date(t.usedAt).toISOString() : "";
    return [
      csvEscapeCell(t.ticketId),
      csvEscapeCell(t.eventId),
      csvEscapeCell(t.eventTitle),
      csvEscapeCell(t.ticketTypeId),
      csvEscapeCell(t.ticketTypeName),
      csvEscapeCell(t.buyerName),
      csvEscapeCell(t.buyerEmail),
      csvEscapeCell(usedAtISO),
    ].join(",");
  });

  const bom = includeBom ? "\ufeff" : "";
  return bom + [header, ...lines].join("\r\n");
}

/* =========================
   ✅ PAGOS: LISTADO GLOBAL + FILTROS + PAGINACIÓN
   (para /organizador/pagos)
   ========================= */

export type PaymentListRow = {
  paymentId: string;
  provider: string;
  providerRef: string | null; // stripe session id (cs_...)
  eventId: string | null;
  eventTitle: string;
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
};

export type PaymentsDashboard = {
  total: number; // total filas (con filtros)
  totals: {
    created: number;
    pending: number;
    paid: number;
    failed: number;
    cancelled: number;
    other: number;

    amountPaidClp: number;
    amountOpenClp: number; // CREATED + PENDING
  };
  rows: PaymentListRow[];
};

type PaymentsDashboardOpts = {
  eventId?: string; // opcional (si no viene, muestra todos)
  status?: string; // ALL|CREATED|PENDING|PAID|FAILED|CANCELLED|...
  q?: string; // search: email/name/id/hold/order/provider_ref
  limit?: number;
  offset?: number;
};

export async function getPaymentsDashboardPgServer(
  opts: PaymentsDashboardOpts
): Promise<PaymentsDashboard> {
  const eventId = String(opts.eventId ?? "").trim();
  const status = String(opts.status ?? "ALL").trim().toUpperCase();
  const qRaw = String(opts.q ?? "").trim();

  // pattern LIKE (Postgres usa backslash como escape por defecto)
  const q = qRaw ? `%${qRaw.replace(/%/g, "\\%").replace(/_/g, "\\_")}%` : "";

  const limit = Number.isFinite(opts.limit) ? Math.max(1, Math.min(200, Number(opts.limit))) : 50;
  const offset = Number.isFinite(opts.offset) ? Math.max(0, Number(opts.offset)) : 0;

  const where: string[] = ["1=1"];
  const params: any[] = [];
  let p = 1;

  if (eventId) {
    where.push(`event_id = $${p++}`);
    params.push(eventId);
  }

  if (status && status !== "ALL") {
    where.push(`UPPER(status) = $${p++}`);
    params.push(status);
  }

  if (q) {
    where.push(
      `(
        id ILIKE $${p} OR
        hold_id ILIKE $${p} OR
        COALESCE(order_id,'') ILIKE $${p} OR
        buyer_email ILIKE $${p} OR
        buyer_name ILIKE $${p} OR
        COALESCE(provider_ref,'') ILIKE $${p}
      )`
    );
    params.push(q);
    p++;
  }

  const whereSql = where.join(" AND ");

  const totalRes = await pool.query<{ total: string }>(
    `SELECT COUNT(*)::text AS total FROM payments WHERE ${whereSql}`,
    params
  );
  const total = Number(totalRes.rows?.[0]?.total ?? 0) || 0;

  const aggRes = await pool.query<{ status: string; count: number; amount: number }>(
    `
    SELECT
      UPPER(status) AS status,
      COUNT(*)::int AS count,
      COALESCE(SUM(amount_clp),0)::int AS amount
    FROM payments
    WHERE ${whereSql}
    GROUP BY UPPER(status)
    `,
    params
  );

  const totals = {
    created: 0,
    pending: 0,
    paid: 0,
    failed: 0,
    cancelled: 0,
    other: 0,
    amountPaidClp: 0,
    amountOpenClp: 0,
  };

  for (const r of aggRes.rows) {
    const st = String(r.status || "").toUpperCase();
    const c = Number(r.count ?? 0) || 0;
    const amt = Number(r.amount ?? 0) || 0;

    if (st === "PAID") {
      totals.paid += c;
      totals.amountPaidClp += amt;
    } else if (st === "PENDING") {
      totals.pending += c;
      totals.amountOpenClp += amt;
    } else if (st === "CREATED") {
      totals.created += c;
      totals.amountOpenClp += amt;
    } else if (st === "FAILED") {
      totals.failed += c;
    } else if (st === "CANCELLED") {
      totals.cancelled += c;
    } else {
      totals.other += c;
    }
  }

  const listParams = [...params, limit, offset];

  const rowsRes = await pool.query<any>(
    `
    SELECT
      id AS "paymentId",
      provider,
      provider_ref AS "providerRef",
      event_id AS "eventId",
      event_title AS "eventTitle",
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
    WHERE ${whereSql}
    ORDER BY created_at DESC
    LIMIT $${p} OFFSET $${p + 1}
    `,
    listParams
  );

  const rows: PaymentListRow[] = rowsRes.rows.map((r: any) => ({
    paymentId: String(r.paymentId),
    provider: String(r.provider || ""),
    providerRef: r.providerRef ? String(r.providerRef) : null,
    eventId: r.eventId ? String(r.eventId) : null,
    eventTitle: String(r.eventTitle || ""),
    buyerEmail: String(r.buyerEmail || ""),
    buyerName: String(r.buyerName || ""),
    amountClp: Number(r.amountClp ?? 0) || 0,
    currency: String(r.currency || "CLP"),
    status: String(r.status || "").toUpperCase(),
    createdAtISO: r.created_at ? new Date(r.created_at).toISOString() : new Date().toISOString(),
    updatedAtISO: r.updated_at ? new Date(r.updated_at).toISOString() : new Date().toISOString(),
    paidAtISO: r.paid_at ? new Date(r.paid_at).toISOString() : null,
    holdId: String(r.holdId || ""),
    orderId: r.orderId ? String(r.orderId) : null,
  }));

  return { total, totals, rows };
}
