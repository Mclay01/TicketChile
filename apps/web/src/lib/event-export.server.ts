import "server-only";
import {dateBound} from '@/lib/operations/date-filter';
import { pool } from "@/lib/db";
import { requireEventAccess } from "@/lib/event-access.server";
import {limit} from '@/lib/security/rate-limit.server';
import { AccessError } from "@/lib/access.server";

export type ExportOptions = {
  eventId: string; status?: "ALL" | "VALID" | "USED" | "CANCELLED";
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
    const date = dateBound(value,operator==="<=");
    if (!Number.isFinite(date.getTime())) throw new AccessError(400, "INVALID_INPUT", "Fecha inválida.");
    params.push(date.toISOString()); where.push(`${dateColumn}${operator}$${params.length}`);
  }
  const result = await pool.query<ExportRow>(
    `SELECT t.id AS "ticketId", t.event_id AS "eventId", o.event_title AS "eventTitle",
            t.ticket_type_id AS "ticketTypeId", t.ticket_type_name AS "ticketTypeName",
            o.buyer_name AS "buyerName", t.buyer_email AS "buyerEmail", t.status,
            t.created_at AS "createdAt", t.used_at AS "usedAt", t.order_id AS "orderId", o.hold_id AS "holdId"
     FROM tickets t JOIN orders o ON o.id=t.order_id
     WHERE ${where.join(" AND ")} ORDER BY ${dateColumn} ${checkins ? "DESC" : "ASC"} LIMIT 5001`, params,
  );
  if(result.rows.length>5000)throw new AccessError(413,'EXPORT_TOO_LARGE','Usa la descarga por páginas del Event Center o reduce el período.');
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

/** Bounded keyset pages with backpressure. Authorization is repeated in every
 * page query; cancellation never holds a database connection or transaction. */
export async function streamEventCsv(options:ExportOptions,checkins=false){
 const access=await requireEventAccess(options.eventId,'attendees.export');
 await limit('attendee-export',`${access.actor.kind}:${access.actor.id}`,{hits:12,seconds:3600});
 const watermark=new Date();
 const from=options.fromISO?dateBound(options.fromISO):null,to=options.toISO?dateBound(options.toISO,true):null;
 if((from&&!Number.isFinite(from.getTime()))||(to&&!Number.isFinite(to.getTime())))throw new AccessError(400,'INVALID_INPUT','Fecha inválida.');
 const ceiling=(await pool.query('SELECT COALESCE(max(id),\'\') AS id FROM tickets WHERE event_id=$1 AND security_can_event($2,$3,$4,event_id,\'attendees.export\')',[options.eventId,access.actor.kind,access.actor.id,access.actor.version])).rows[0].id;
 const encoder=new TextEncoder();let cursor='',header=false,done=false;
 return new ReadableStream<Uint8Array>({async pull(controller){try{
  if(done){controller.close();return;}
  if(!header){header=true;controller.enqueue(encoder.encode('\ufeffticketId,ticketType,holderEmail,status,createdAt,usedAt,orderId\r\n'));return;}
  const rows=(await pool.query(`SELECT t.id,t.ticket_type_name,lower(COALESCE(NULLIF(btrim(t.owner_email),''),NULLIF(btrim(o.owner_email),''),t.buyer_email)) AS holder,t.status,t.created_at,t.used_at,t.order_id
   FROM tickets t JOIN orders o ON o.id=t.order_id WHERE t.event_id=$1 AND t.id>$5 AND t.id<=$6 AND t.created_at<=$11
   AND security_can_event($2,$3,$4,t.event_id,'attendees.export') AND ($7='' OR t.status=$7) AND ($8='' OR t.ticket_type_id=$8)
   AND ($9::timestamptz IS NULL OR ${checkins||options.dateField==='usedAt'?'t.used_at':'t.created_at'}>=$9)
   AND ($10::timestamptz IS NULL OR ${checkins||options.dateField==='usedAt'?'t.used_at':'t.created_at'}<=$10)
   ORDER BY t.id LIMIT 500`,[options.eventId,access.actor.kind,access.actor.id,access.actor.version,cursor,ceiling,checkins?'USED':options.status==='ALL'?'':options.status||'',options.ticketTypeId||'',from,to,watermark])).rows;
  if(!rows.length){done=true;controller.close();return;}
  cursor=rows[rows.length-1].id;controller.enqueue(encoder.encode(rows.map(r=>[r.id,r.ticket_type_name,r.holder,r.status,new Date(r.created_at).toISOString(),r.used_at?new Date(r.used_at).toISOString():'',r.order_id].map(csvEscapeCell).join(',')).join('\r\n')+'\r\n'));
  if(rows.length<500)done=true;
 }catch(error){done=true;controller.error(error);}},cancel(){done=true;}});
}
