import "server-only";
import { pool } from "@/lib/db";
import { AccessError } from "@/lib/access.server";
import { cookieIdentity } from "./http.server";
import { buyerPrincipal } from "./current.server";
import { principal,eligible,type Principal } from "./identity.server";

export const roleCapabilities={
  ORGANIZER_MANAGER:["event.read","event.edit","scanner.read","scanner.checkin","attendees.read","attendees.export"],
  ORGANIZER_DOOR:["scanner.read","scanner.checkin"],
  ORGANIZER_FINANCE:["finance.read"],
  ORGANIZER_SUPPORT:["attendees.read"],
} as const;
export type StaffRole=keyof typeof roleCapabilities;
export type Capability="event.read"|"event.edit"|"scanner.read"|"scanner.checkin"|"attendees.read"|"attendees.export"|"finance.read"|"staff.manage"|"audit.read";
export function requestedCapabilities(role:unknown,capabilities:unknown){
  if(typeof role!=="string"||!Object.hasOwn(roleCapabilities,role))throw new AccessError(400,"INVALID_ROLE","Rol invalido.");
  const allowed:readonly string[]=roleCapabilities[role as StaffRole];
  const requested=capabilities===undefined?[...allowed]:capabilities;
  if(!Array.isArray(requested)||!requested.length||!requested.every(value=>typeof value==="string"&&allowed.includes(value)))
    throw new AccessError(400,"INVALID_CAPABILITIES","Permisos invalidos.");
  return {role:role as StaffRole,capabilities:[...new Set(requested as string[])]};
}
export async function organizerActor(){
  const owner=await cookieIdentity("ORGANIZER");
  if(owner)return owner;
  const buyer=await buyerPrincipal();
  if(!buyer)throw new AccessError(401,"UNAUTHENTICATED","Inicia sesion.");
  return buyer;
}
export async function requireOrganizerCapability(organizerId:string,capability:Capability,actor?:Principal){
  const p=actor||await organizerActor();
  const fresh=await principal(p.kind,p.id);
  if(!eligible(fresh)||fresh.version!==p.version)throw new AccessError(401,"SESSION_INVALID","Inicia sesion nuevamente.");
  const owner=await pool.query(`SELECT o.id FROM organizer_users o JOIN identity_accounts a ON a.kind='ORGANIZER' AND a.id=o.id
    WHERE o.id=$1 AND o.approved AND o.verified AND o.is_active AND NOT a.disabled`,[organizerId]);
  if(!owner.rowCount)throw new AccessError(404,"NOT_AUTHORIZED","Organizador no disponible.");
  if(p.kind==="ORGANIZER"&&p.id===organizerId)return p;
  if(p.kind==="BUYER"){
    const result=await pool.query(`SELECT 1 FROM organizer_staff WHERE organizer_id=$1 AND buyer_id::text=$2 AND revoked_at IS NULL
      AND event_ids IS NULL AND $3=ANY(capabilities) AND $3=ANY(staff_role_capabilities(role))`,[organizerId,p.id,capability]);
    if(result.rowCount)return p;
  }
  throw new AccessError(403,"NOT_AUTHORIZED","No tienes permiso para esta operacion.");
}
export const eventPermissionParams=(p:Principal)=>[p.kind,p.id,p.version];
