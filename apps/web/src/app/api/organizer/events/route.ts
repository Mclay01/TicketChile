import { accessResponse,privateJson,requireSameOrigin } from '@/lib/access.server';
import { readBody } from '@/lib/security/http.server';
import { createEvent } from '@/lib/organizer/events.server';
export async function POST(req:Request){try{requireSameOrigin(req);const b=await readBody(req);return privateJson(201,await createEvent(typeof b.organizerId==='string'?b.organizerId:''));}catch(e){return accessResponse(e);}}
