import 'server-only';
import { withTx } from '@/lib/db';
import { AccessError } from '@/lib/access.server';
import { expireHoldsTx } from '@/lib/payments/inventory.server';
/** Public availability contains inventory only, never check-ins or buyer data. */
export async function getEventAvailabilityPgServer(eventId:string) {
 return withTx(async client=>{
  const event=await client.query('SELECT id FROM events WHERE id=$1 AND is_published=true',[eventId]);
  if(!event.rowCount) throw new AccessError(404,'NOT_FOUND','Evento no encontrado.');
  await expireHoldsTx(client);
  const rows=await client.query('SELECT id,name,GREATEST(0,capacity-sold-held)::int AS remaining FROM ticket_types WHERE event_id=$1 ORDER BY id',[eventId]);
  return {eventId,byType:rows.rows.map(row=>({ticketTypeId:row.id,ticketTypeName:row.name,remaining:row.remaining})),
   remainingByTicketTypeId:Object.fromEntries(rows.rows.map(row=>[row.id,row.remaining])),soldOut:rows.rows.every(row=>row.remaining===0)};
 });
}
