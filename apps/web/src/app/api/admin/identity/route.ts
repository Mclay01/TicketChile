import { accessResponse,AccessError,privateJson,requireSameOrigin } from "@/lib/access.server";
import { currentIdentity } from "@/lib/security/current.server";
import { identityKind } from "@/lib/security/identity.server";
import { changeIdentity } from "@/lib/security/administration.server";
import { readBody,stringValue } from "@/lib/security/http.server";
import { limit } from "@/lib/security/rate-limit.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
  try{
    requireSameOrigin(req);const actor=await currentIdentity("ADMIN");
    await limit("identity-change",actor.id,{hits:30,seconds:900});
    const body=await readBody(req);
    if(body.disabled!==undefined&&typeof body.disabled!=="boolean")throw new AccessError(400,"INVALID_INPUT","Estado invalido.");
    await changeIdentity(actor,identityKind(body.kind),stringValue(body.id),{disabled:body.disabled as boolean|undefined,role:body.role===undefined?undefined:stringValue(body.role)});
    return privateJson(200,{ok:true});
  }catch(error){return accessResponse(error);}
}
