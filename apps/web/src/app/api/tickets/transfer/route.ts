import { AccessError, accessResponse, privateJson, requireSameOrigin } from '@/lib/access.server';
import { readBody } from '@/lib/security/http.server';
import { acceptTransfer, initiateTransfer, inspectTransferClaim, manageTransfer, transferDetail } from '@/lib/transfers.server';
import { cookies } from 'next/headers';
import { seal, unseal } from '@/lib/security/crypto.server';
import { publicLimit } from '@/lib/security/rate-limit.server';
const cookie='tc_transfer_claim';
export async function POST(request:Request) {
  try {
    requireSameOrigin(request); const b=await readBody(request);
    if(b.action==='stage') {
      await publicLimit(request,'transfer-stage');
      if(typeof b.token!=='string'||!/^[a-f0-9]{64}$/.test(b.token))throw new AccessError(400,'INVALID_CLAIM','Invitación inválida.');
      const response=privateJson(200,{ok:true});
      response.cookies.set(cookie,seal(JSON.stringify({token:b.token,until:Date.now()+48*3600000}),'transfer-claim'),{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/api/tickets/transfer',maxAge:48*3600});
      return response;
    }
    if(b.action==='initiate')return privateJson(200,await initiateTransfer(String(b.ticketId||''),b.recipient,b.requestKey));
    if(b.action==='detail')return privateJson(200,await transferDetail(String(b.ticketId||'')));
    if(b.action==='cancel'||b.action==='resend')return privateJson(200,await manageTransfer(String(b.id||''),b.action));
    if(b.action==='inspect'||b.action==='accept') {
      let token=typeof b.token==='string'?b.token:'';
      if(!token)try { const stored=JSON.parse(unseal((await cookies()).get(cookie)?.value||'','transfer-claim')); if(stored.until>Date.now())token=stored.token; }catch { /* Invalid cookie grants no access. */ }
      return privateJson(200,b.action==='inspect'?await inspectTransferClaim(token):await acceptTransfer(token));
    }
    throw new AccessError(400,'INVALID_INPUT','Operación inválida.');
  } catch(error) { return accessResponse(error); }
}
