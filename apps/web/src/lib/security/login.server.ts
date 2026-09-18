import "server-only";
import { NextResponse } from "next/server";
import { authenticate,createSession,type IdentityKind } from "./identity.server";
import { readBody,setIdentityCookie,safePath,stringValue } from "./http.server";
import { publicLimit } from "./rate-limit.server";
import { verifyMfa } from "./mfa.server";
import { AccessError,accessResponse,requireSameOrigin } from "@/lib/access.server";

export async function privilegedLogin(req:Request,kind:Exclude<IdentityKind,"BUYER">) {
  const base=kind==="ADMIN"?"/admin":"/organizador";
  const form=!req.headers.get("content-type")?.includes("application/json");
  try {
    requireSameOrigin(req);
    const body=await readBody(req);
    const login=stringValue(body.username||body.user||body.email).trim().toLowerCase();
    await publicLimit(req,`login:${kind}`,login,{hits:15,seconds:900});
    const p=await authenticate(kind,login,stringValue(body.password||body.pass));
    if (!p) throw new AccessError(401,"INVALID_CREDENTIALS","Credenciales invalidas.");
    let verified=false;
    if (p.mfa_enabled) { await verifyMfa(p,stringValue(body.code)); verified=true; }
    const token=await createSession(p,verified);
    const setup=p.mfa_required&&!verified;
    const next=setup?`/security?kind=${kind}`:safePath(stringValue(body.next||body.from),base);
    const response=form?NextResponse.redirect(new URL(next,req.url),303):NextResponse.json({ok:true,mfaSetupRequired:setup,next});
    response.headers.set("Cache-Control","private, no-store");
    setIdentityCookie(response,kind,token,setup?600:28800);
    return response;
  } catch(error) {
    if (form && error instanceof AccessError && error.status!==429) return NextResponse.redirect(new URL(`${base}/login?reason=invalid`,req.url),303);
    return accessResponse(error);
  }
}
