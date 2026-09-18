import "server-only";
import { findIdentity,principal,createSession,readSession,revokeSession } from "@/lib/security/identity.server";
export { hashPassword,verifyPassword } from "@/lib/security/crypto.server";
export type AdminUser = { id:string; username:string; displayName:string|null; role:string; };
export async function findAdminByUsername(username:string) { return findIdentity("ADMIN",username); }
export async function createAdminSession(id:string,mfaVerified=false) {
 const p=await principal("ADMIN",id); if(!p) throw new Error("Identity unavailable");
 return createSession(p,mfaVerified);
}
export async function getAdminFromSession(token:string):Promise<AdminUser|null> {
 const p=await readSession(token,"ADMIN"); if(!p) return null;
 return {id:p.id,username:p.login,displayName:p.name,role:p.role };
}
export const revokeAdminSession=revokeSession;
