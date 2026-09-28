import {requireAdminCapability} from '@/lib/admin/policy.server';
import {accessResponse,privateJson,requireSameOrigin} from '@/lib/access.server';
export async function POST(req:Request){try{requireSameOrigin(req);await requireAdminCapability('moderation.write');return privateJson(410,{ok:false,error:'Use the audited organizer review operation.'});}catch(e){return accessResponse(e);}}
