import {accessResponse,privateJson} from '@/lib/access.server';
import {accessConfig} from '@/lib/operations/access.server';
export async function GET(req:Request){try{return privateJson(200,await accessConfig(new URL(req.url).searchParams.get('eventId')||''));}catch(e){return accessResponse(e);}}
