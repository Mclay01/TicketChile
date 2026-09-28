import {adminList} from '@/lib/admin/queries.server';
import {accessResponse,privateJson} from '@/lib/access.server';
export const dynamic='force-dynamic';
export async function GET(req:Request){try{return privateJson(200,{ok:true,...await adminList('events',Object.fromEntries(new URL(req.url).searchParams))});}catch(e){return accessResponse(e);}}
