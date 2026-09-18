export { POST } from "@/app/api/organizador/logout/route";
import { privateJson } from "@/lib/access.server";
export function GET(){return privateJson(405,{ok:false,error:"Usa POST para cerrar sesion."});}
