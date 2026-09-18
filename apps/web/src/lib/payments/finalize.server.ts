import 'server-only';
import { randomUUID } from 'node:crypto';
import { withTx } from '@/lib/db';
import { AccessError } from '@/lib/access.server';
import { audit } from '@/lib/security/audit.server';
import { lockInventory, releaseHoldTx } from './inventory.server';
import type { Payment, VerifiedPayment } from './types';

const actor = {kind:'SYSTEM' as const,id:'payment-service'};
function mismatch(): never { throw new AccessError(409,'PAYMENT_MISMATCH','No se pudo verificar el pago.'); }
/** Only server adapters may call this boundary. No HTTP payload is evidence. */
export async function recordVerifiedPayment(evidence: VerifiedPayment) {
  return withTx(async client => {
    await lockInventory(client);
    const p = (await client.query<Payment>('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[evidence.paymentId])).rows[0];
    if (!p || !['stripe','webpay','flow'].includes(p.provider) || p.provider !== evidence.provider || p.provider_ref !== evidence.reference ||
        p.hold_id !== evidence.holdId || p.amount_clp !== evidence.amount || p.currency !== evidence.currency ||
        (p.provider_intent && evidence.intent !== p.provider_intent) || !evidence.observationKey) mismatch();
    const insert = await client.query(`INSERT INTO payment_evidence(provider,reference,observation_key,payment_id,status,amount_clp,currency)
      VALUES($1,$2,$3,$4,$5,$6,$7) ON CONFLICT DO NOTHING RETURNING payment_id`,
      [p.provider,evidence.reference,evidence.observationKey,p.id,evidence.status,evidence.amount,evidence.currency]);
    if (!insert.rowCount) {
      const previous = (await client.query('SELECT * FROM payment_evidence WHERE provider=$1 AND observation_key=$2',[p.provider,evidence.observationKey])).rows[0];
      if (previous.payment_id !== p.id || previous.reference !== evidence.reference || previous.status !== evidence.status) mismatch();
      return p.id;
    }
    const next = p.status === 'PAID' ? 'PAID' : evidence.status === 'PENDING' && ['FAILED','CANCELLED'].includes(p.status) ? p.status : evidence.status;
    await client.query(`UPDATE payments SET status=$2,verified_at=CASE WHEN $4='PAID' THEN COALESCE(verified_at,NOW()) ELSE verified_at END,
      paid_at=CASE WHEN $4='PAID' THEN COALESCE(paid_at,NOW()) ELSE paid_at END,
      provider_intent=COALESCE(provider_intent,$3),updated_at=NOW() WHERE id=$1`,[p.id,next,evidence.intent||null,evidence.status]);
    if (next === 'FAILED' || next === 'CANCELLED') await releaseHoldTx(client,p.hold_id);
    if (p.status !== next || (!p.verified_at && evidence.status==='PAID')) await audit(client,{actor,action:next === 'PAID' ? 'payment.confirmed' : 'payment.state_changed',targetType:'payment',targetId:p.id,eventId:p.event_id,metadata:{provider:p.provider,outcome:next}});
    return p.id;
  });
}
/** Sole paid-ticket issuer. Retry after an interrupted transaction is safe. */
export async function finalizePayment(paymentId: string) {
  return withTx(async client => {
    await lockInventory(client);
    const p = (await client.query<Payment>('SELECT * FROM payments WHERE id=$1 FOR UPDATE',[paymentId])).rows[0];
    if (!p || p.status !== 'PAID' || !p.verified_at) throw new AccessError(409,'UNVERIFIED_PAYMENT','Pago sin verificar.');
    const hold = (await client.query('SELECT *,expires_at>NOW() AS unexpired FROM holds WHERE id=$1 FOR UPDATE',[p.hold_id])).rows[0];
    if (!hold || !hold.owner_email || hold.owner_email.toLowerCase() !== p.owner_email.toLowerCase() || hold.event_id !== p.event_id) mismatch();
    const existing = (await client.query('SELECT id FROM orders WHERE hold_id=$1',[p.hold_id])).rows[0];
    if (existing) {
      if (hold.status !== 'CONSUMED' || p.order_id !== existing.id) mismatch();
      return {orderId:existing.id as string,status:'ISSUED' as const};
    }
    if (hold.status !== 'ACTIVE' || !hold.unexpired || new Date(p.verified_at) > new Date(hold.expires_at)) {
      await releaseHoldTx(client,p.hold_id);
      await client.query("UPDATE payments SET fulfillment_status='REVIEW' WHERE id=$1",[p.id]);
      if (p.fulfillment_status !== 'REVIEW') await audit(client,{actor,action:'payment.fulfillment_review',targetType:'payment',targetId:p.id,eventId:p.event_id,metadata:{outcome:'RESERVATION_EXPIRED'}});
      return {orderId:'',status:'REVIEW' as const};
    }
    const items = (await client.query('SELECT * FROM hold_items WHERE hold_id=$1 ORDER BY ticket_type_id',[p.hold_id])).rows;
    if (!items.length || items.some(it=>it.event_id !== p.event_id) || items.reduce((sum,it)=>sum+Number(it.unit_price_clp)*it.qty,0)+p.fee_clp !== p.amount_clp) mismatch();
    const orderId = `ord_${randomUUID()}`;
    await client.query(`INSERT INTO orders(id,hold_id,event_id,event_title,buyer_name,buyer_email,owner_email)
      VALUES($1,$2,$3,$4,$5,$6,$7)`,[orderId,p.hold_id,p.event_id,p.event_title,p.buyer_name,p.buyer_email,p.owner_email]);
    for (const item of items) {
      const stock = await client.query(`UPDATE ticket_types SET held=held-$3,sold=sold+$3
        WHERE event_id=$1 AND id=$2 AND held>=$3 AND sold+$3<=capacity RETURNING id`,[p.event_id,item.ticket_type_id,item.qty]);
      if (!stock.rowCount) mismatch();
      for (let index=1; index<=item.qty; index++) {
        const ticketId = `tix_${randomUUID()}`;
        await client.query(`INSERT INTO tickets(id,order_id,event_id,ticket_type_id,ticket_type_name,buyer_email,owner_email,status,issuance_index)
          VALUES($1,$2,$3,$4,$5,$6,$7,'VALID',$8)`,[ticketId,orderId,p.event_id,item.ticket_type_id,item.ticket_type_name,p.buyer_email,p.owner_email,index]);
        await client.query(`INSERT INTO mail_jobs(id,dedupe_key,purpose,source_id,recipient) VALUES($1,$2,'TICKET',$3,$4)`,
          [randomUUID(),`initial:${ticketId}`,ticketId,p.owner_email.toLowerCase()]);
      }
    }
    await client.query("UPDATE holds SET status='CONSUMED' WHERE id=$1",[p.hold_id]);
    await client.query("UPDATE payments SET order_id=$2,fulfillment_status='ISSUED',updated_at=NOW() WHERE id=$1",[p.id,orderId]);
    await audit(client,{actor,action:'payment.finalized',targetType:'payment',targetId:p.id,eventId:p.event_id,metadata:{provider:p.provider,outcome:'ISSUED'}});
    return {orderId,status:'ISSUED' as const};
  });
}
