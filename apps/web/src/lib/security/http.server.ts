import "server-only";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { AccessError } from "@/lib/access.server";
import { readSession, type IdentityKind } from "./identity.server";
export const stringValue=(value:unknown)=>typeof value==="string"?value:"";
export async function readBody(req:Request):Promise<Record<string,unknown>> {
  if (Number(req.headers.get("content-length"))>16384) throw new AccessError(413,"TOO_LARGE","Solicitud demasiado grande.");
  const reader=req.body?.getReader();let size=0;const chunks:Uint8Array[]=[];
  if(reader)try{for(;;){const {done,value}=await reader.read();if(done)break;size+=value.byteLength;
    if(size>16384){await reader.cancel();throw new AccessError(413,"TOO_LARGE","Solicitud demasiado grande.");}chunks.push(value);
  }}finally{reader.releaseLock();}
  const text=Buffer.concat(chunks).toString("utf8");
  if (req.headers.get("content-type")?.includes("application/json")) {
    let value:unknown;
    try{value=JSON.parse(text);}catch{throw new AccessError(400,"INVALID_INPUT","Solicitud invalida.");}
    if (!value || typeof value!=="object" || Array.isArray(value)) throw new AccessError(400,"INVALID_INPUT","Solicitud invalida.");
    return value as Record<string,unknown>;
  }
  return Object.fromEntries(new URLSearchParams(text));
}
export const cookieName=(kind:IdentityKind)=>kind==="ADMIN"?"tc_admin_sess":"tc_org_sess";
export function setIdentityCookie(response:NextResponse,kind:IdentityKind,token:string,maxAge=28800) {
  response.cookies.set(cookieName(kind),token,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax",path:"/",maxAge});
  // Expire the old broad-domain cookie during the transition. New cookies are host-only.
  if (process.env.NODE_ENV==="production") response.headers.append("Set-Cookie",`${cookieName(kind)}=; Domain=.ticketchile.com; Path=/; Max-Age=0; HttpOnly; Secure; SameSite=Lax`);
}
export async function cookieIdentity(kind:IdentityKind,allowPending=false) {
  const jar=await cookies();
  return readSession(jar.get(cookieName(kind))?.value||"",kind,allowPending);
}
export function safePath(value:string,fallback:string) {
  return value.startsWith("/") && !value.startsWith("//") && !/[\\\r\n]/.test(value)?value:fallback;
}
