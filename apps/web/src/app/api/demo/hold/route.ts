import { createHoldPgServer } from "@/lib/hold.pg.server";
import { paymentCreator } from "@/lib/payment-create-access.server";
import { AccessError,accessResponse,privateJson } from "@/lib/access.server";
import { readBody,stringValue } from "@/lib/security/http.server";
export const runtime="nodejs";
export const dynamic="force-dynamic";
export async function POST(req:Request){
 try{
  const ownerEmail=await paymentCreator(req);
  const body=await readBody(req);
  const eventId=stringValue(body.eventId);
  if(!eventId||!Array.isArray(body.items))throw new AccessError(400,"INVALID_INPUT","Reserva invalida.");
  const requested=body.items.map((item:Record<string,unknown>)=>({ticketTypeId:stringValue(item.ticketTypeId||item.id||item.typeId),qty:Number(item.qty??item.quantity)}));
  return privateJson(200,{ok:true,...await createHoldPgServer({eventId,requested,ownerEmail})});
 }catch(error){return accessResponse(error);}
}
