import { privateJson } from "@/lib/access.server";
export const dynamic="force-dynamic";
export function GET() { return privateJson(410,{ok:false,error:"Usa el inicio de sesion con MFA del organizador."}); }
