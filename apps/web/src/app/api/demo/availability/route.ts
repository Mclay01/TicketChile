import { getEventAvailabilityPgServer } from '@/lib/availability.pg.server';
import { AccessError,accessResponse,privateJson,identifier } from '@/lib/access.server';
export const runtime='nodejs';
export const dynamic='force-dynamic';
export async function GET(req:Request) {
 try {
  const id=new URL(req.url).searchParams.get('eventId');
  if(!identifier(id)) throw new AccessError(400,'INVALID_INPUT','Evento invalido.');
  return privateJson(200,{ok:true,...await getEventAvailabilityPgServer(id!)});
 } catch(error) {return accessResponse(error);}
}
