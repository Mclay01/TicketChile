import {accessResponse,privateJson,requireSameOrigin} from '@/lib/access.server';
import {readBody} from '@/lib/security/http.server';
import {requireAdminCapability,type OperationInput} from '@/lib/admin/policy.server';
import {moderate,configureCommission,supportOperation} from '@/lib/admin/operations.server';
import {refundOperation} from '@/lib/payments/refunds.server';
import {settlementOperation} from '@/lib/admin/settlements.server';
import {paymentOperation} from '@/lib/admin/payment-operations.server';
import {resolveLegacy} from '@/lib/admin/legacy.server';
import {limit} from '@/lib/security/rate-limit.server';
export const runtime='nodejs';export const dynamic='force-dynamic';
export async function POST(request:Request){
 try{
  requireSameOrigin(request);const actor=await requireAdminCapability('operations.read');
  await limit('admin-operations',actor.id,{hits:60,seconds:60});
  const input=await readBody(request) as OperationInput,action=String(input.action||'');
  const run=action==='legacy.review'?resolveLegacy:action==='commission.create'?configureCommission:action.startsWith('refund.')?refundOperation:action.startsWith('settlement.')?settlementOperation:action.startsWith('support.')?supportOperation:action.startsWith('payment.')||action==='order.resend'?paymentOperation:moderate;
  return privateJson(200,{ok:true,...await run(input,actor)});
 }catch(error){return accessResponse(error);}
}
