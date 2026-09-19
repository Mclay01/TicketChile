import { type NextRequest } from "next/server";
import { requireAdmin } from "@/lib/admin-guard.server";
import { privateJson } from "@/lib/access.server";
export async function POST(req:NextRequest){const gate=await requireAdmin(req);if(!gate.ok)return gate.response;
return privateJson(410,{ok:false,error:"Legacy publication retired. Use the authorized Event Center lifecycle."});}
