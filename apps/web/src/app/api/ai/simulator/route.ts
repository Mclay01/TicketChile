import {cookies} from 'next/headers';
import {accessResponse,privateJson,requireSameOrigin} from '@/lib/access.server';
import {readBody} from '@/lib/security/http.server';
import {organizerContext} from '@/lib/organizer/events.server';
import {providerStatus} from '@/lib/ai/provider.server';
import {claimSimulator,generateSimulator,readSimulator,simulatorCookie,startSession,storeSimulator} from '@/lib/ai/simulator.server';
export async function GET(){try{
 const token=(await cookies()).get(simulatorCookie)?.value;
 const context=await organizerContext().catch(()=>null);
 const saved=token?await readSimulator(token).catch(()=>null):null;
 return privateJson(200,{...saved,status:providerStatus(),organizations:context?.organizations.filter(o=>o.can_create).map(o=>({id:o.id,name:o.name}))||[]});
}catch(error){return accessResponse(error);}}
export async function POST(req:Request){try{
 requireSameOrigin(req);const b=await readBody(req,65536),old=(await cookies()).get(simulatorCookie)?.value;
 if(!['generate','save','claim'].includes(String(b.action)))return privateJson(400,{error:'Acción inválida.'});
 const token=b.action==='claim'?old||'':await startSession(req,old);
 const result=b.action==='generate'?await generateSimulator(req,token,b.prompt,b.requestId):b.action==='save'?await storeSimulator(token,b.draft):b.action==='claim'?await claimSimulator(token,b.organizerId,b.confirmed):null;
 const response=privateJson(result?200:400,result||{error:'Acción inválida.'});
 response.cookies.set(simulatorCookie,b.action==='claim'?'':token,{httpOnly:true,secure:process.env.NODE_ENV==='production',sameSite:'lax',path:'/',maxAge:b.action==='claim'?0:604800});
 return response;
}catch(error){return accessResponse(error);}}
