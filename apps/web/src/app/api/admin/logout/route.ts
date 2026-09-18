import type { NextRequest } from "next/server";
import { logout } from "@/lib/security/logout.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export const POST=(req:NextRequest)=>logout(req,"ADMIN");
