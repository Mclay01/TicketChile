import { accessResponse, AccessError, privateJson, requireSameOrigin } from "@/lib/access.server";
import { readBody, setIdentityCookie, stringValue } from "@/lib/security/http.server";
import { identityKind, principal, createSession } from "@/lib/security/identity.server";
import { currentIdentity } from "@/lib/security/current.server";
import { requestRecovery, resetPassword } from "@/lib/security/recovery.server";
import { beginEnrollment, confirmEnrollment, disableMfa, verifyMfa } from "@/lib/security/mfa.server";
import { publicLimit } from "@/lib/security/rate-limit.server";
import { acceptInvite, inviteStaff, revokeStaff,updateStaff } from "@/lib/security/staff.server";
import { organizerActor } from "@/lib/security/capabilities.server";
import { requestVerification } from "@/lib/security/registration.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";

export async function POST(req:Request,context:{params:Promise<{operation:string}>}) {
  try {
    requireSameOrigin(req);
    const {operation}=await context.params;
    const body=await readBody(req);
    const kind=identityKind(body.kind||"BUYER");
    const token=stringValue(body.token);
    const password=stringValue(body.password);
    const code=stringValue(body.code);
    if(operation==="verify-resend"){
      const login=stringValue(body.login).slice(0,254);
      await publicLimit(req,"verify-resend",`${kind}:${login}`,{hits:5,seconds:900});
      return privateJson(200,await requestVerification(kind,login));
    }
    if(operation==="recovery") {
      const login=stringValue(body.login).slice(0,254);
      await publicLimit(req,"recovery",`${kind}:${login}`,{hits:5,seconds:900});
      return privateJson(200,await requestRecovery(kind,login));
    }
    if(operation==="reset") {
      await publicLimit(req,"reset",token.slice(0,64),{hits:10,seconds:900});
      await resetPassword(kind,token,password);
      return privateJson(200,{ok:true,relogin:true});
    }
    if(operation==="invite-accept") {
      const p=await currentIdentity("BUYER");
      await publicLimit(req,"invite-accept",p.id,{hits:20,seconds:900});
      return privateJson(200,{ok:true,...await acceptInvite(p,token)});
    }
    if(operation==="invite"||operation==="staff-revoke"||operation==="invite-revoke"||operation==="staff-update") {
      const actor=await organizerActor();
      await publicLimit(req,"staff-change",`${actor.kind}:${actor.id}`,{hits:40,seconds:900});
      const organizerId=stringValue(body.organizerId);
      if(operation==="staff-update"){
        await updateStaff(actor,{organizerId,id:stringValue(body.id),role:body.role,capabilities:body.capabilities,eventIds:body.eventIds});
        return privateJson(200,{ok:true});
      }
      if(operation==="invite") return privateJson(201,{ok:true,...await inviteStaff(actor,{
        organizerId,email:stringValue(body.email),role:body.role,capabilities:body.capabilities,eventIds:body.eventIds,
      })});
      await revokeStaff(actor,organizerId,stringValue(body.id),operation==="invite-revoke");
      return privateJson(200,{ok:true});
    }
    if(operation==="mfa") {
      const p=await currentIdentity(kind,true);
      const action=stringValue(body.action);
      if(action==="status")return privateJson(200,{ok:true,enabled:p.mfa_enabled,required:p.mfa_required});
      if(action==="begin")return privateJson(200,{ok:true,...await beginEnrollment(p,password,code)});
      if(action==="confirm"||action==="verify") {
        const result=action==="confirm"?await confirmEnrollment(p,code):(await verifyMfa(p,code),{});
        const response=privateJson(200,{ok:true,...result,relogin:kind==="BUYER"});
        if(kind!=="BUYER") {
          const fresh=action==="confirm"?await principal(kind,p.id):p;
          if(!fresh||(action==="confirm"&&"version" in result&&fresh.version!==result.version))throw new AccessError(401,"UNAUTHENTICATED","Inicia sesion.");
          setIdentityCookie(response,kind,await createSession(fresh,true));
        }
        return response;
      }
      if(action==="disable") {await disableMfa(p,password,code);return privateJson(200,{ok:true,relogin:true});}
    }
    throw new AccessError(400,"INVALID_INPUT","Operacion invalida.");
  }catch(error){return accessResponse(error);}
}
