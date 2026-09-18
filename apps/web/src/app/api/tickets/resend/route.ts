import { publicLimit } from '@/lib/security/rate-limit.server';
import { accessResponse,privateJson,requireSameOrigin,identifier,AccessError } from '@/lib/access.server';
import { requireBuyerEmail } from '@/lib/ticket-access.server';
import { queueTicketResend } from '@/lib/mail/jobs.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function POST(req:Request) {
 try {
  requireSameOrigin(req);
  const email=await requireBuyerEmail();
  await publicLimit(req,'ticket-resend',email,{hits:10,seconds:900});
  const body=await req.json();
  if(!identifier(body?.ticketId)) throw new AccessError(400,'INVALID_INPUT','Entrada invalida.');
  return privateJson(202,{ok:true,...await queueTicketResend(body.ticketId,email)});
 } catch(error) {return accessResponse(error);}
}
