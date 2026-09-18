import 'server-only';
import { pool } from '@/lib/db';
import { randomUUID } from 'node:crypto';
import { TICKET_OWNER_SQL } from '@/lib/buyer-guard.server';
/** Compatibility entry: enqueue only. The worker owns delivery and retries. */
export async function deliverPaidOrder(orderId:string) {
 const tickets=await pool.query(`SELECT t.id,${TICKET_OWNER_SQL} AS recipient FROM tickets t JOIN orders o ON o.id=t.order_id
  WHERE o.id=$1 AND t.status='VALID' AND EXISTS(SELECT 1 FROM payments p WHERE p.order_id=o.id AND p.status='PAID')`,[orderId]);
 for(const ticket of tickets.rows) await pool.query(`INSERT INTO mail_jobs(id,dedupe_key,purpose,source_id,recipient)
  VALUES($1,$2,'TICKET',$3,$4) ON CONFLICT DO NOTHING`,[randomUUID(),`initial:${ticket.id}`,ticket.id,ticket.recipient]);
 return {queued:tickets.rows.length};
}
