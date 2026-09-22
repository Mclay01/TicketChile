import {accessResponse,privateJson} from '@/lib/access.server';
import {lookupTicket} from '@/lib/operations/access.server';
export async function GET(req:Request){try{const p=new URL(req.url).searchParams;return privateJson(200,await lookupTicket(p.get('eventId')||'',p.get('ticketId')||''));}catch(e){return accessResponse(e);}}
