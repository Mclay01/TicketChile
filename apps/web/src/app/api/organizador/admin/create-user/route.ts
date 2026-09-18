import { privateJson } from "@/lib/access.server";
export const dynamic="force-dynamic";
export function POST(){return privateJson(410,{ok:false,code:"RETIRED",error:"Aprovisionamiento HTTP retirado. Usa el flujo de registro y aprobacion."});}
