import { privilegedLogin } from "@/lib/security/login.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=(req:Request)=>privilegedLogin(req,"ORGANIZER");
