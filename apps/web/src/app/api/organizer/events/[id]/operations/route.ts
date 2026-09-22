import {accessResponse,privateJson,requireSameOrigin} from '@/lib/access.server';
import {readBody} from '@/lib/security/http.server';
import {issueCourtesy,revokeCourtesy} from '@/lib/operations/courtesy.server';
import {savePromotion} from '@/lib/operations/promotions.server';
import {attendeeList,resendAttendee} from '@/lib/operations/attendees.server';
import {saveAccess} from '@/lib/operations/access.server';
type Context={params:Promise<{id:string}>};
export async function GET(req:Request,ctx:Context){try{const {id}=await ctx.params,p=new URL(req.url).searchParams;return privateJson(200,await attendeeList(id,{q:p.get('q')||'',status:p.get('status')||'',tier:p.get('tier')||'',from:p.get('from')||'',to:p.get('to')||'',payment:p.get('payment')||'',ticket:p.get('ticket')||'',page:Number(p.get('page')||1)}));}catch(e){return accessResponse(e);}}
export async function POST(req:Request,ctx:Context){try{requireSameOrigin(req);const b=await readBody(req),{id}=await ctx.params;
 if(b.operation==='courtesy')return privateJson(200,await issueCourtesy(id,b));
 if(b.operation==='courtesy-revoke')return privateJson(200,await revokeCourtesy(id,b.ticketId,b.reason));
 if(b.operation==='promotion')return privateJson(200,await savePromotion(id,b));
 if(b.operation==='access')return privateJson(200,await saveAccess(id,b));
 if(b.operation==='resend')return privateJson(202,await resendAttendee(id,b.ticketId));
 return privateJson(400,{error:'Operación inválida.'});
}catch(e){return accessResponse(e);}}
