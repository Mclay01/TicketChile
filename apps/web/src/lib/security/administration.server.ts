import "server-only";
import { withTx } from "@/lib/db";
import { AccessError } from "@/lib/access.server";
import { eligible,principal,revokeAll,type Principal,type IdentityKind } from "./identity.server";
import { audit } from "./audit.server";
export async function changeIdentity(actor:Principal,kind:IdentityKind,id:string,change:{disabled?:boolean;role?:string}){
  return withTx(async client=>{
    // Serialize administrative role changes, including last-superadmin protection.
    await client.query("SELECT pg_advisory_xact_lock(7319322)");
    const fresh=await principal(actor.kind,actor.id,client);
    if(!eligible(fresh)||fresh.kind!=="ADMIN"||fresh.role!=="SUPERADMIN"||fresh.version!==actor.version)
      throw new AccessError(403,"NOT_AUTHORIZED","Se requiere superadministrador.");
    if(change.role!==undefined&&(kind!=="ADMIN"||!["ADMIN","SUPERADMIN"].includes(change.role)))throw new AccessError(400,"INVALID_ROLE","Rol invalido.");
    const target=await principal(kind,id,client);
    if(!target)throw new AccessError(404,"NOT_FOUND","Cuenta no encontrada.");
    if(kind==="ADMIN"&&target.role==="SUPERADMIN"&&(change.disabled===true||change.role==="ADMIN")){
      const others=await client.query(`SELECT 1 FROM identity_principals p JOIN identity_accounts a ON a.kind=p.kind AND a.id=p.id
        WHERE p.kind='ADMIN' AND p.role='SUPERADMIN' AND p.active AND NOT a.disabled AND p.id<>$1`,[id]);
      if(!others.rowCount)throw new AccessError(409,"LAST_ADMIN","No se puede quitar el ultimo superadministrador.");
    }
    if(change.disabled!==undefined)await client.query("UPDATE identity_accounts SET disabled=$3 WHERE kind=$1 AND id=$2",[kind,id,change.disabled]);
    if(change.role!==undefined)await client.query("UPDATE admin_users SET role=$2 WHERE id=$1",[id,change.role]);
    await revokeAll(client,{kind,id});
    await audit(client,{actor,action:"identity.permissions_changed",targetType:kind,targetId:id,metadata:{role:change.role,outcome:change.disabled===undefined?"role-change":change.disabled?"disabled":"enabled"}});
  });
}
