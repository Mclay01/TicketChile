import { verificationHandler } from "@/lib/security/registration.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=(req:Request)=>verificationHandler(req,"ORGANIZER");
