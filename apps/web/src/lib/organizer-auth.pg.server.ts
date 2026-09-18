import "server-only";
import { findIdentity,principal,createSession,readSession,revokeSession } from "@/lib/security/identity.server";
export { hashPassword,verifyPassword } from "@/lib/security/crypto.server";
export type OrganizerUser = { id:string; username:string; displayName:string|null; role:string; verified:boolean; approved:boolean; };
export async function findOrganizerByUsername(username:string) { return findIdentity("ORGANIZER",username); }
export async function createOrganizerSession(id:string,mfaVerified=false) {
 const p=await principal("ORGANIZER",id); if(!p) throw new Error("Identity unavailable");
 return createSession(p,mfaVerified);
}
export async function getOrganizerFromSession(token:string):Promise<OrganizerUser|null> {
 const p=await readSession(token,"ORGANIZER"); if(!p) return null;
 return {id:p.id,username:p.login,displayName:p.name,role:p.role,verified:p.verified,approved:p.active };
}
export const revokeOrganizerSession=revokeSession;
