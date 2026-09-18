import 'server-only';
import { createHash, randomUUID } from 'node:crypto';
import { pool, withTx } from '@/lib/db';
import { AccessError, accessResponse, privateJson } from '@/lib/access.server';
import { paymentCreator } from '@/lib/payment-create-access.server';
import { createHoldPgServer } from '@/lib/hold.pg.server';
import { audit } from '@/lib/security/audit.server';
import { readBody } from '@/lib/security/http.server';
import { lockInventory } from './inventory.server';
import { feePolicy, requireAvailable, type Provider } from './config.server';
import { adapter } from './adapters.server';
import type { Payment } from './types';

const text = (value: unknown) => typeof value === 'string' ? value.trim() : '';
function invalid(): never { throw new AccessError(400,'INVALID_INPUT','Datos de compra invalidos.'); }
export async function preparePayment(owner: string, provider: Provider, body: Record<string,unknown>, requestKey: string) {
  if (!owner) throw new AccessError(401,'UNAUTHENTICATED','Inicia sesion.');
  const fee = feePolicy();
  const holdId = text(body.holdId), eventId = text(body.eventId);
  const name = text(body.buyerName), email = text(body.buyerEmail).toLowerCase();
  if (name.length < 2 || name.length > 150 || email.length > 254 || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) invalid();
  if ((!requestKey && !holdId) || (requestKey && !/^[a-zA-Z0-9_-]{16,100}$/.test(requestKey)) || holdId.length>200 || eventId.length>200) invalid();
  const quantities = new Map<string,number>();
  if (!holdId) {
    if (!eventId || !Array.isArray(body.items) || !body.items.length || body.items.length > 10) invalid();
    for (const item of body.items) {
      if (!item || typeof item !== 'object') invalid();
      const id = text(item.ticketTypeId), qty = item.qty;
      if (!id || !Number.isSafeInteger(qty) || qty <= 0 || qty > 10) invalid();
      quantities.set(id,(quantities.get(id) || 0)+qty);
    }
  }
  const requested = [...quantities].sort(([a],[b])=>a.localeCompare(b)).map(([ticketTypeId,qty])=>({ticketTypeId,qty}));
  const hash = createHash('sha256').update(JSON.stringify({provider,holdId,eventId,name,email,requested})).digest('hex');
  return withTx(async client => {
    await lockInventory(client);
    if (requestKey) {
      const old = (await client.query<Payment>('SELECT * FROM payments WHERE lower(owner_email)=$1 AND request_key=$2 FOR UPDATE',[owner,requestKey])).rows[0];
      if (old) {
        if (old.request_hash !== hash) throw new AccessError(409,'RETRY_CONFLICT','La compra cambio.');
        if (body.amount !== undefined && Number(body.amount) !== old.amount_clp) throw new AccessError(409,'AMOUNT_CHANGED','El total de la compra cambio.');
        return old;
      }
    }
    const id = holdId || (await createHoldPgServer({eventId,requested,ownerEmail:owner},client)).hold.id;
    const hold = (await client.query(`SELECT *,expires_at>NOW() AS unexpired FROM holds WHERE id=$1 AND lower(owner_email)=$2 FOR UPDATE`,[id,owner])).rows[0];
    if (!hold) throw new AccessError(404,'NOT_FOUND','Reserva no encontrada.');
    const old = (await client.query<Payment>('SELECT * FROM payments WHERE hold_id=$1 FOR UPDATE',[id])).rows[0];
    if (old) {
      if (old.owner_email.toLowerCase() !== owner || old.provider !== provider) throw new AccessError(409,'RETRY_CONFLICT','Reserva no disponible.');
      if (body.amount !== undefined && Number(body.amount) !== old.amount_clp) throw new AccessError(409,'AMOUNT_CHANGED','El total de la compra cambio.');
      return old;
    }
    if (hold.status !== 'ACTIVE' || !hold.unexpired) throw new AccessError(409,'HOLD_EXPIRED','Reserva vencida.');
    const event = (await client.query('SELECT title FROM events WHERE id=$1 AND is_published=true',[hold.event_id])).rows[0];
    if (!event) throw new AccessError(409,'EVENT_UNAVAILABLE','Evento no disponible.');
    const sum = (await client.query('SELECT SUM(unit_price_clp::bigint*qty)::text AS total FROM hold_items WHERE hold_id=$1',[id])).rows[0];
    const amount = Number(sum.total)+fee.feeClp;
    if (!Number.isSafeInteger(amount) || amount <= 0 || amount > 2147483647) invalid();
    if (body.amount !== undefined && Number(body.amount) !== amount) throw new AccessError(409,'AMOUNT_CHANGED','El total de la compra cambio.');
    // Webpay buy_order allows at most 26 characters; persist the exact value.
    const paymentId = `pay_${randomUUID().replace(/-/g,'').slice(0,22)}`;
    const result = await client.query<Payment>(`INSERT INTO payments
      (id,hold_id,provider,event_id,event_title,buyer_name,buyer_email,owner_email,amount_clp,currency,status,creation_state,request_key,request_hash,fee_clp)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'CLP','CREATED','NEW',$10,$11,$12) RETURNING *`,
      [paymentId,id,provider,hold.event_id,event.title,name,email,owner,amount,requestKey||null,hash,fee.feeClp]);
    await audit(client,{actor:{kind:'SYSTEM',id:'checkout'},action:'payment.created',targetType:'payment',targetId:paymentId,eventId:hold.event_id,metadata:{provider}});
    return result.rows[0];
  });
}
export async function startPayment(payment: Payment) {
  if (payment.status !== 'PAID') {
    const hold=await pool.query("SELECT id FROM holds WHERE id=$1 AND status='ACTIVE' AND expires_at>NOW()",[payment.hold_id]);
    if (!hold.rowCount) throw new AccessError(409,'HOLD_EXPIRED','Reserva vencida.');
  }
  if (payment.creation_state === 'READY' || payment.status === 'PAID') return payment;
  const service = adapter(payment.provider);
  // Claim before network I/O. No second process can create concurrently. Stripe
  // can recover a stale claim using its stable idempotency key, within 23 hours.
  const claimed = await withTx(async client => {
    await lockInventory(client);
    const result=await client.query<Payment>(`UPDATE payments p SET creation_state='CREATING',creation_started_at=COALESCE(creation_started_at,date_trunc('second',NOW())),updated_at=NOW()
    WHERE id=$1 AND status='CREATED' AND (creation_state='NEW' OR
      ($2 AND creation_state IN ('CREATING','UNKNOWN') AND updated_at<NOW()-interval '2 minutes' AND creation_started_at>NOW()-interval '23 hours'))
    AND EXISTS(SELECT 1 FROM holds h WHERE h.id=p.hold_id AND h.status='ACTIVE' AND h.expires_at>NOW()) RETURNING p.*`,
    [payment.id,service.capabilities.createRetry === 'idempotent']);
    if(result.rows[0]?.provider==='stripe') {
      // Align inventory with Checkout's minimum 30-minute expiration. Extend
      // only on the initial claim, never refresh this clock on retries.
      await client.query("UPDATE holds SET expires_at=$2::timestamptz+interval '35 minutes' WHERE id=$1 AND status='ACTIVE'",
        [payment.hold_id,result.rows[0].creation_started_at]);
    }
    return result;
  });
  if (!claimed.rows[0]) throw new AccessError(409,'PAYMENT_RECOVERY_REQUIRED','Compra en proceso o pendiente de revision.');
  try {
    const created = await service.create(claimed.rows[0]);
    const url = new URL(created.url);
    if (url.protocol !== 'https:' || !created.reference || created.reference.length > 512) throw new Error('Invalid provider response');
    return (await pool.query<Payment>(`UPDATE payments SET provider_ref=$2,checkout_url=$3,creation_state='READY',
      status=CASE WHEN status='CREATED' THEN 'PENDING' ELSE status END,updated_at=NOW() WHERE id=$1 RETURNING *`,[payment.id,created.reference,created.url])).rows[0];
  } catch {
    await withTx(async client => {
      await client.query("UPDATE payments SET creation_state='UNKNOWN',updated_at=NOW() WHERE id=$1 AND creation_state='CREATING'",[payment.id]);
      await audit(client,{actor:{kind:'SYSTEM',id:'checkout'},action:'payment.creation_uncertain',targetType:'payment',targetId:payment.id,metadata:{provider:payment.provider,outcome:'REVIEW'}});
    });
    throw new AccessError(503,'PAYMENT_RECOVERY_REQUIRED','No se pudo confirmar el inicio del pago.');
  }
}
export async function createPaymentRoute(req: Request, provider: Provider) {
  try {
    const owner = await paymentCreator(req);
    requireAvailable(provider);
    const body = await readBody(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) invalid();
    const payment = await startPayment(await preparePayment(owner,provider,body,req.headers.get('Idempotency-Key') || ''));
    return privateJson(200,{ok:true,provider,paymentId:payment.id,holdId:payment.hold_id,status:payment.status,
      amountClp:payment.amount_clp,amount:payment.amount_clp,currency:payment.currency,
      checkoutUrl:payment.checkout_url,url:payment.checkout_url,
      ...(provider === 'webpay' ? {webpay:{url:payment.checkout_url,token:payment.provider_ref}} : {})});
  } catch(error) { return accessResponse(error); }
}
