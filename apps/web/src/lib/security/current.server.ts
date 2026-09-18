import "server-only";
import { getServerSession } from "next-auth/next";
import { authOptions } from "@/auth";
import { cookieIdentity } from "./http.server";
import { principal,type IdentityKind } from "./identity.server";
import { AccessError } from "@/lib/access.server";

export async function buyerPrincipal(){
  const session=await getServerSession(authOptions);
  const user=session?.user as {id?:string;securityVersion?:number}|undefined;
  const id=user?.id;
  if(!id)return null;
  const p=await principal("BUYER",id);
  return p&&!p.disabled&&p.active&&p.verified&&p.version===user?.securityVersion?p:null;
}
export async function currentIdentity(kind:IdentityKind,allowPending=false){
  const p=kind==="BUYER"?await buyerPrincipal():await cookieIdentity(kind,allowPending);
  if(!p)throw new AccessError(401,"UNAUTHENTICATED","Inicia sesion nuevamente.");
  return p;
}
