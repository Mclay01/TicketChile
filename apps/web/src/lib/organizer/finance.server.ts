import 'server-only';
import {pool} from '@/lib/db';
import {organizerActor} from '@/lib/security/capabilities.server';
import {readEvent} from './events.server';
export async function eventSettlements(id:string){
 const actor=await organizerActor();await readEvent(id,'finance.read',undefined,actor);
 const rows=await pool.query(`SELECT id,status,gross_clp,refunds_clp,commission_clp,adjustments_clp,net_clp,created_at FROM settlements WHERE event_id=$1 AND organizer_id=(SELECT organizer_id FROM organizer_events WHERE event_id=$1) AND security_can_event($2,$3,$4,event_id,'finance.read') ORDER BY created_at DESC LIMIT 100`,[id,actor.kind,actor.id,actor.version]);
 return rows.rows as {id:string;status:string;gross_clp:string;refunds_clp:string;commission_clp:string;adjustments_clp:string;net_clp:string;created_at:Date}[];
}
