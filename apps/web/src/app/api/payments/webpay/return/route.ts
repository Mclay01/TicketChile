import { NextResponse } from 'next/server';
import { pool } from '@/lib/db';
import { AccessError, accessResponse } from '@/lib/access.server';
import { paymentOrigin } from '@/lib/payments/config.server';
import { reconcilePayment } from '@/lib/payments/reconcile.server';
import type { Payment } from '@/lib/payments/types';
export const runtime='nodejs';
export const dynamic='force-dynamic';
async function handle(req: Request) {
 try {
  const fields=req.method==='POST' ? await req.formData() : new URL(req.url).searchParams;
  const token=String(fields.get('token_ws')||'');
  const base=paymentOrigin();
  if(!token || fields.get('TBK_TOKEN')) return NextResponse.redirect(`${base}/?canceled=1`,303);
  if(token.length>512) throw new AccessError(400,'INVALID_INPUT','Token invalido.');
  const p=(await pool.query<Payment>("SELECT * FROM payments WHERE provider='webpay' AND provider_ref=$1",[token])).rows[0];
  if(!p) throw new AccessError(404,'NOT_FOUND','Pago no encontrado.');
  await reconcilePayment(p,true);
  const response=NextResponse.redirect(`${base}/checkout/confirm?payment_id=${encodeURIComponent(p.id)}`,303);
  response.headers.set('Cache-Control','private, no-store');response.headers.set('Referrer-Policy','no-referrer');
  return response;
 } catch(error) {return accessResponse(error);}
}
export const GET=handle;
export const POST=handle;
