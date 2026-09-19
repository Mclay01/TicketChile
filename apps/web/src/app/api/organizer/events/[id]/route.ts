import { accessResponse,privateJson,requireSameOrigin } from '@/lib/access.server';
import { readBody } from '@/lib/security/http.server';
import { readEvent,saveEvent,transitionEvent } from '@/lib/organizer/events.server';
import { organizerProposal } from '@/lib/organizer/operations.server';
type Context={params:Promise<{id:string}>};
export async function GET(_req:Request,ctx:Context){try{return privateJson(200,await readEvent((await ctx.params).id,'event.read'));}catch(e){return accessResponse(e);}}
export async function PATCH(req:Request,ctx:Context){try{requireSameOrigin(req);const b=await readBody(req,131072);return privateJson(200,await saveEvent((await ctx.params).id,b.revision,b.draft,b.confirmPrices===true));}catch(e){return accessResponse(e);}}
export async function POST(req:Request,ctx:Context){try{requireSameOrigin(req);const b=await readBody(req,131072),id=(await ctx.params).id;return privateJson(200,b.action==='proposal'?await organizerProposal(id,b.prompt):await transitionEvent(id,b.revision,b.target,b.confirmation));}catch(e){return accessResponse(e);}}
