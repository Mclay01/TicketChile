import {accessResponse,privateJson,requireSameOrigin} from '@/lib/access.server';
import {readBody} from '@/lib/security/http.server';
import {proposeEvent,resolveProposal} from '@/lib/ai/service.server';
type Context={params:Promise<{id:string}>};
export async function POST(req:Request,ctx:Context){try{
 requireSameOrigin(req);const b=await readBody(req,65536),{id}=await ctx.params;
 if(b.action==='generate')return privateJson(200,await proposeEvent(id,b.prompt,b.feature,b.requestId));
 if(b.action==='apply'||b.action==='reject')return privateJson(200,await resolveProposal(id,b.proposalId,b.patch,b.confirmed,b.action==='reject'));
 return privateJson(400,{error:'Acción inválida.'});
}catch(error){return accessResponse(error);}}
