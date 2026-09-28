import {adminDetail} from '@/lib/admin/queries.server';
import {accessResponse,privateJson} from '@/lib/access.server';
export const dynamic='force-dynamic';
export async function GET(_req:Request,{params}:{params:Promise<{id:string}>}){try{const {id}=await params;return privateJson(200,{ok:true,...await adminDetail('events',id)});}catch(e){return accessResponse(e);}}
