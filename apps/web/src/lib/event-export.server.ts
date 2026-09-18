import "server-only";
import { pool } from "@/lib/db";
import { requireEventAccess } from "@/lib/event-access.server";
import { AccessError } from "@/lib/access.server";

type ExportOptions = {
  eventId: string; status?: "ALL" | "VALID" | "USED";
  ticketTypeId?: string; fromISO?: string; toISO?: string;
  dateField?: "createdAt" | "usedAt"; includeBom?: boolean;
};
type ExportRow = {
  ticketId: string; eventId: string; eventTitle: string; ticketTypeId: string;
  ticketTypeName: string; buyerName: string; buyerEmail: string; status: string;
  createdAt: Date | string; usedAt: Date | string | null; orderId: string; holdId: string;
};

export function csvEscapeCell(value: unknown) {
  let cell = String(value ?? "");
  if (/^[\s\uFEFF]*[=+\-@]/.test(cell) || /^[\t\r\n]/.test(cell)) cell = "'" + cell;
  return /[,"\r\n]/.test(cell) ? `"${cell.replace(/"/g, '""')}"` : cell;
}

async function exportEventCsv(options: ExportOptions, checkins: boolean) {
  const access = await requireEventAccess(options.eventId, "attendees.export");
  const where = ["t.event_id=$1", "security_can_event($2,$3,$4,t.event_id,'attendees.export')"];
  const params: (string | number)[] = [access.event.id, access.actor.kind, access.actor.id, access.actor.version];
  const status = checkins ? "USED" : options.status;
  if (status && status !== "ALL") { params.push(status); where.push(`t.status=$${params.length}`); }
  if (options.ticketTypeId) { params.push(options.ticketTypeId); where.push(`t.ticket_type_id=$${params.length}`); }
  const dateColumn = checkins || options.dateField === "usedAt" ? "t.used_at" : "t.created_at";
  for (const [value, operator] of [[options.fromISO, ">="], [options.toISO, "<="]] as const) {
    if (!value) continue;
    const date = new Date(value);
    if (!Number.isFinite(date.getTime())) throw new AccessError(400, "INVALID_INPUT", "Fecha inválida.");
    params.push(date.toISOString()); where.push(`${dateColumn}${operator}$${params.length}`);
  }
  const result = await pool.query<ExportRow>(
    `SELECT t.id AS "ticketId", t.event_id AS "eventId", o.event_title AS "eventTitle",
            t.ticket_type_id AS "ticketTypeId", t.ticket_type_name AS "ticketTypeName",
            o.buyer_name AS "buyerName", t.buyer_email AS "buyerEmail", t.status,
            t.created_at AS "createdAt", t.used_at AS "usedAt", t.order_id AS "orderId", o.hold_id AS "holdId"
     FROM tickets t JOIN orders o ON o.id=t.order_id
     WHERE ${where.join(" AND ")} ORDER BY ${dateColumn} ${checkins ? "DESC" : "ASC"}`, params,
  );
  const headers = checkins
    ? ["ticketId", "eventId", "eventTitle", "ticketTypeId", "ticketTypeName", "buyerName", "buyerEmail", "usedAtISO"]
    : ["ticketId", "eventId", "eventTitle", "ticketTypeId", "ticketTypeName", "buyerName", "buyerEmail", "status", "createdAtISO", "usedAtISO", "orderId", "holdId"];
  const lines = result.rows.map(row => {
    const record: Record<string, unknown> = { ...row,
      createdAtISO: row.createdAt ? new Date(row.createdAt).toISOString() : "",
      usedAtISO: row.usedAt ? new Date(row.usedAt).toISOString() : "",
    };
    return headers.map(key => csvEscapeCell(record[key])).join(",");
  });
  return (options.includeBom === false ? "" : "\ufeff") + [headers.join(","), ...lines].join("\r\n");
}

export const exportTicketsCsvPgServer = (options: ExportOptions) => exportEventCsv(options, false);
export const exportCheckinsCsvPgServer = (options: ExportOptions) => exportEventCsv(options, true);
