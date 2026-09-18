import "server-only";
import { NextResponse, type NextRequest } from "next/server";
import { accessResponse,privateJson,requireSameOrigin } from "@/lib/access.server";
import { revokeSession,type IdentityKind } from "./identity.server";
import { cookieName,setIdentityCookie } from "./http.server";
export async function logout(req:NextRequest,kind:IdentityKind){
  try{
    requireSameOrigin(req);
    await revokeSession(req.cookies.get(cookieName(kind))?.value||"");
    const response=req.headers.get("accept")?.includes("text/html")
      ?NextResponse.redirect(new URL(kind==="ADMIN"?"/admin/login":"/organizador/login",req.url),303)
      :privateJson(200,{ok:true});
    setIdentityCookie(response,kind,"",0);return response;
  }catch(error){return accessResponse(error);}
}
