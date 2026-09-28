import 'server-only';
import { withTx } from '@/lib/db';
import { AccessError } from '@/lib/access.server';
import { requireEventAccess } from '@/lib/event-access.server';
import { lockInventory } from '@/lib/payments/inventory.server';
import { audit } from '@/lib/security/audit.server';
import { limit } from '@/lib/security/rate-limit.server';
export async function configureTransferPolicy(eventId:string,b:Record<string,unknown>) {
  const access=await requireEventAccess(eventId,'event.edit');
  // Business approval is explicit configuration, never inferred from a prototype.
  if(typeof b.enabled!=='boolean'||typeof b.allowCourtesy!=='boolean'||!['NONE','IDENTITY_REQUIRED','NON_TRANSFERABLE'].includes(String(b.identityRule))||typeof b.approvalReference!=='string'||b.approvalReference.trim().length<3||b.approvalReference.length>200||!(b.maxTransfers===null||Number.isSafeInteger(b.maxTransfers)&&Number(b.maxTransfers)>0)||!(b.feeClp===null||Number.isSafeInteger(b.feeClp)&&Number(b.feeClp)>=0)||!(b.deadline===null||typeof b.deadline==='string'&&Number.isFinite(Date.parse(b.deadline)))||!Array.isArray(b.disabledTiers)||b.disabledTiers.length>100||b.disabledTiers.some(t=>typeof t!=='string'))throw new AccessError(400,'INVALID_POLICY','La política requiere configuración y referencia de aprobación explícitas.');
  await limit('transfer-policy',`${access.actor.kind}:${access.actor.id}`,{hits:30,seconds:3600});
  return withTx(async db=>{
    await lockInventory(db);
    const scope=await db.query("SELECT 1 FROM events WHERE id=$1 AND security_can_event($2,$3,$4,id,'event.edit') FOR UPDATE",[eventId,access.actor.kind,access.actor.id,access.actor.version]);
    if(!scope.rowCount)throw new AccessError(404,'NOT_FOUND','Evento no disponible.');
    const tiers=await db.query('SELECT id FROM ticket_types WHERE event_id=$1',[eventId]);
    if((b.disabledTiers as string[]).some(id=>!tiers.rows.some(t=>t.id===id)))throw new AccessError(400,'INVALID_POLICY','Tipo de entrada inválido.');
    await db.query(`INSERT INTO ticket_transfer_policies(event_id,enabled,deadline,max_transfers,fee_clp,allow_courtesy,identity_rule,approval_reference)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8) ON CONFLICT(event_id) DO UPDATE SET enabled=$2,deadline=$3,max_transfers=$4,fee_clp=$5,allow_courtesy=$6,identity_rule=$7,approval_reference=$8,updated_at=now()`,[eventId,b.enabled,b.deadline,b.maxTransfers,b.feeClp,b.allowCourtesy,b.identityRule,String(b.approvalReference).trim()]);
    await db.query('UPDATE ticket_types SET transfer_disabled=(id=ANY($2::text[])) WHERE event_id=$1',[eventId,b.disabledTiers]);
    await audit(db,{actor:access.actor,eventId,organizerId:access.organizerId,action:'transfer.policy_configured',targetType:'event',targetId:eventId});
    return {ok:true};
  });
}
