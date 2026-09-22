import {accessResponse,privateJson,requireSameOrigin,AccessError} from '@/lib/access.server';
import {readBody} from '@/lib/security/http.server';
import {requireBuyerEmail} from '@/lib/ticket-access.server';
import {limit} from '@/lib/security/rate-limit.server';
import {pool} from '@/lib/db';
import {codeValue,discountItems,invalid} from '@/lib/operations/promotion-pricing.server';
import {feePolicy} from '@/lib/payments/config.server';
export async function POST(req:Request){try{
 requireSameOrigin(req);const owner=await requireBuyerEmail();await limit('promotion-quote',owner,{hits:30,seconds:60});const b=await readBody(req),code=codeValue(b.code);
 if(typeof b.eventId!=='string'||!Array.isArray(b.items)||!b.items.length||b.items.length>10)invalid();
 const quantities=new Map<string,number>();for(const it of b.items){if(!it||typeof it.ticketTypeId!=='string'||!Number.isSafeInteger(it.qty)||it.qty<1||it.qty>10)invalid();quantities.set(it.ticketTypeId,(quantities.get(it.ticketTypeId)||0)+it.qty);}
 if([...quantities.values()].reduce((a,b)=>a+b,0)>10)invalid();
 const rows=(await pool.query(`SELECT tt.id AS ticket_type_id,tt.price_clp AS unit_price_clp,tt.max_per_order,tt.capacity-tt.sold-tt.held AS remaining FROM ticket_types tt JOIN events e ON e.id=tt.event_id WHERE e.id=$1 AND e.lifecycle='PUBLISHED' AND e.date_iso>now() AND tt.active AND tt.visible AND (tt.sales_start IS NULL OR tt.sales_start<=now()) AND (tt.sales_end IS NULL OR tt.sales_end>now()) AND tt.id=ANY($2)`,[b.eventId,[...quantities.keys()]])).rows;
 if(rows.length!==quantities.size||rows.some(r=>quantities.get(r.ticket_type_id)!>r.remaining||quantities.get(r.ticket_type_id)!>(r.max_per_order||10)))throw new AccessError(409,'STOCK_CHANGED','Revisa la disponibilidad.');
 const items=rows.map(r=>({...r,qty:quantities.get(r.ticket_type_id)!}));let discount=0;
 if(code){const p=(await pool.query(`SELECT p.* FROM promotions p WHERE event_id=$1 AND code=$2 AND active AND starts_at<=now() AND ends_at>now() AND usage_limit>(SELECT count(*) FROM promotion_reservations r JOIN holds h ON h.id=r.hold_id WHERE r.promotion_id=p.id AND (h.status='CONSUMED' OR h.status='ACTIVE' AND h.expires_at>now()))`,[b.eventId,code])).rows[0];if(!p)invalid();discount=discountItems(items,p).reduce((n,it)=>n+it.discount*it.qty,0);if(!discount)invalid();}
 const subtotal=items.reduce((n,it)=>n+it.unit_price_clp*it.qty,0),fee=feePolicy().feeClp;return privateJson(200,{code,subtotal,discount,fee,total:subtotal-discount+fee,reserved:false});
}catch(e){return accessResponse(e);}}
