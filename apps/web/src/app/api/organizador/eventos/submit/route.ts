import { privateJson,accessResponse,requireSameOrigin } from "@/lib/access.server";
import { organizerActor } from "@/lib/security/capabilities.server";
export async function POST(req:Request){try{requireSameOrigin(req);await organizerActor();return privateJson(410,{error:"Crea un borrador en el nuevo centro de eventos."});}catch(e){return accessResponse(e);}}
