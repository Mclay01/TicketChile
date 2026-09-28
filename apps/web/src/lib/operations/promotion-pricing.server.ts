import 'server-only';
import type {PoolClient} from 'pg';
import {AccessError} from '@/lib/access.server';
export function invalid(message='Promoción no disponible.'):never{throw new AccessError(400,'INVALID_PROMOTION',message);}
export function codeValue(value:unknown){if(value===undefined||value==='')return '';if(typeof value!=='string')invalid();const code=value.trim().toUpperCase();if(!/^[A-Z0-9][A-Z0-9_-]{2,31}$/.test(code))invalid('Código inválido: usa 3 a 32 letras, números, guion o guion bajo.');return code;}
type Item={ticket_type_id:string;unit_price_clp:number;qty:number};
export function discountItems(items:Item[],p:{tier_ids:string[];kind:string;value:number}){
 return items.map(it=>{const eligible=!p.tier_ids.length||p.tier_ids.includes(it.ticket_type_id);const discount=eligible?Math.min(it.unit_price_clp-1,p.kind==='PERCENT'?Math.floor(it.unit_price_clp*p.value/100):p.value):0;return {...it,discount:Math.max(0,discount),final:it.unit_price_clp-Math.max(0,discount)};});
}
/** Called only under M4's inventory lock, before payment creation. Reservations
 * count ACTIVE unexpired holds and CONSUMED holds; release/expiry needs no counter repair. */
export async function applyPromotionTx(client:PoolClient,holdId:string,eventId:string,raw:unknown){
 const code=codeValue(raw);if(!code)return;const old=(await client.query(`SELECT p.code FROM promotion_reservations r JOIN promotions p ON p.id=r.promotion_id WHERE r.hold_id=$1`,[holdId])).rows[0];
 if(old){if(code&&old.code!==code)invalid('La reserva ya tiene otro descuento.');return;}
 if(process.env.PROMOTIONS_ENABLED==='false')invalid();
 const p=(await client.query(`SELECT p.* FROM promotions p WHERE event_id=$1 AND code=$2 AND active AND starts_at<=now() AND ends_at>now() FOR UPDATE`,[eventId,code])).rows[0];if(!p)invalid();
 const used=Number((await client.query(`SELECT count(*) FROM promotion_reservations r JOIN holds h ON h.id=r.hold_id WHERE r.promotion_id=$1 AND (h.status='CONSUMED' OR (h.status='ACTIVE' AND h.expires_at>now()))`,[p.id])).rows[0].count);if(used>=p.usage_limit)invalid('La promoción alcanzó su límite.');
 const items=(await client.query<Item>('SELECT ticket_type_id,unit_price_clp,qty FROM hold_items WHERE hold_id=$1',[holdId])).rows,discounted=discountItems(items,p),total=discounted.reduce((n,it)=>n+it.discount*it.qty,0);if(!total)invalid('La promoción no aplica a estas entradas.');
 for(const it of discounted)await client.query('UPDATE hold_items SET original_unit_price_clp=unit_price_clp,unit_price_clp=$3 WHERE hold_id=$1 AND ticket_type_id=$2',[holdId,it.ticket_type_id,it.final]);
 await client.query('INSERT INTO promotion_reservations(hold_id,promotion_id,discount_clp) VALUES($1,$2,$3)',[holdId,p.id,total]);
}
