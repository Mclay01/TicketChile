import 'server-only';
import { randomUUID } from 'node:crypto';
import type { Pool, PoolClient } from 'pg';
import { pool, withTx } from '@/lib/db';
import { AccessError, identifier } from '@/lib/access.server';
import { TICKET_OWNER_SQL } from '@/lib/buyer-guard.server';
import { currentIdentity } from '@/lib/security/current.server';
import { principal, type Principal } from '@/lib/security/identity.server';
import { digest, randomToken, seal } from '@/lib/security/crypto.server';
import { audit } from '@/lib/security/audit.server';
import { limit } from '@/lib/security/rate-limit.server';
import { lockInventory } from '@/lib/payments/inventory.server';

type Db = Pool | PoolClient;
type Transfer = { id:string; ticket_id:string; sender_id:string; sender_email:string; recipient_email:string; state:string; credential_version:number; expires_at:Date; created_at:Date; accepted_at:Date|null; invitation_revision:number };
type Ticket = { id:string; event_id:string; owner_email:string; status:string; credential_version:number; title:string; ticket_type_name:string; eligible:boolean };
const uuid = (v:unknown):v is string => typeof v==='string' && /^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(v);
function fail(code:string, message:string, status=409):never { throw new AccessError(status,code,message); }
const masked = (email:string) => email.replace(/^(.).*(@.*)$/, '$1•••$2');
async function actor(db:Db,p:Principal) {
  const fresh=await principal('BUYER',p.id,db);
  if(p.kind!=='BUYER'||!fresh||!fresh.active||!fresh.verified||fresh.disabled||fresh.version!==p.version) fail('UNAUTHENTICATED','Inicia sesión nuevamente.',401);
  return fresh;
}
async function ticket(db:Db,id:string,lock=false):Promise<Ticket> {
  const row=(await db.query<Ticket>(`SELECT t.id,t.event_id,t.status,t.credential_version,t.ticket_type_name,e.title,${TICKET_OWNER_SQL} AS owner_email,
    coalesce(t.status='VALID' AND t.used_at IS NULL AND e.lifecycle NOT IN ('DRAFT','CANCELLED','ENDED')
      AND p.enabled AND NOT tt.transfer_disabled AND p.fee_clp=0 AND p.identity_rule='NONE'
      AND (p.deadline IS NULL OR p.deadline>now()) AND (p.max_transfers IS NULL OR t.credential_version<p.max_transfers)
      AND (p.allow_courtesy OR NOT EXISTS(SELECT 1 FROM complimentary_issues c WHERE c.order_id=t.order_id))
      AND NOT EXISTS(SELECT 1 FROM refunds r WHERE r.order_id=t.order_id AND r.status NOT IN ('FAILED','REJECTED')),false) AS eligible
    FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=t.event_id
    JOIN ticket_types tt ON tt.event_id=t.event_id AND tt.id=t.ticket_type_id
    LEFT JOIN ticket_transfer_policies p ON p.event_id=t.event_id WHERE t.id=$1 ${lock?'FOR UPDATE OF t':''}`,[id])).rows[0];
  if(!row) fail('NOT_FOUND','Entrada no encontrada.',404);
  return row;
}
function eligible(t:Ticket) { if(!t.eligible) fail('TRANSFER_UNAVAILABLE','Esta entrada no permite transferencias en su estado o configuración actual.'); }
function pending(t:Transfer) {
  if(t.state!=='PENDING') fail(t.state==='ACCEPTED'?'ALREADY_ACCEPTED':'CLAIM_CANCELLED',t.state==='ACCEPTED'?'La invitación ya fue aceptada.':'La invitación ya no está activa.');
  if(new Date(t.expires_at).getTime()<=Date.now()) fail('CLAIM_EXPIRED','La invitación venció.');
}
async function message(db:PoolClient,t:Transfer,kind:'INVITATION'|'ACCEPTED'|'CANCELLED',to:string,token?:string) {
  const id=randomUUID();
  const payload={to,kind,token,transferId:t.id};
  await db.query('INSERT INTO ticket_transfer_messages(id,transfer_id,kind,revision,payload_cipher,expires_at) VALUES($1,$2,$3,$4,$5,$6)',[id,t.id,kind,t.invitation_revision,seal(JSON.stringify(payload),`transfer-mail:${id}`),kind==='INVITATION'?t.expires_at:new Date(Date.now()+7*86400000)]);
  await db.query("INSERT INTO mail_jobs(id,dedupe_key,purpose,source_id,recipient) VALUES($1,$2,'TRANSFER',$3,$4)",[randomUUID(),`transfer:${id}`,id,to]);
}
async function record(db:PoolClient,p:Principal,t:Transfer,action:string) {
  await audit(db,{actor:p,action:`transfer.${action}`,targetType:'ticket',targetId:t.ticket_id});
}
export async function initiateTransfer(ticketId:string,recipient:unknown,requestKey:unknown,p?:Principal) {
  const user=p||await currentIdentity('BUYER');
  await limit('transfer-initiate',user.id,{hits:20,seconds:3600});
  if(!identifier(ticketId)||!uuid(requestKey)||typeof recipient!=='string'||recipient.length>254||!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(recipient)) fail('INVALID_INPUT','Revisa el correo del destinatario.',400);
  const email=recipient.trim().toLowerCase();
  // No recipient account lookup: response and delivery are identical for new accounts.
  return withTx(async db=>{
    await lockInventory(db); const me=await actor(db,user),t=await ticket(db,ticketId,true);
    if(t.owner_email!==me.email?.toLowerCase()) fail('NOT_FOUND','Entrada no encontrada.',404);
    if(email===t.owner_email) fail('INVALID_INPUT','Elige un destinatario diferente.',400);
    const replay=(await db.query<Transfer>('SELECT * FROM ticket_transfers WHERE sender_id=$1 AND request_key=$2',[me.id,requestKey])).rows[0];
    if(replay) {
      if(replay.ticket_id!==ticketId||replay.recipient_email!==email) fail('REQUEST_CONFLICT','La solicitud ya fue utilizada.');
      return {id:replay.id,state:replay.state};
    }
    eligible(t);
    await db.query("UPDATE ticket_transfers SET state='EXPIRED' WHERE ticket_id=$1 AND state='PENDING' AND expires_at<=now()",[ticketId]);
    if((await db.query("SELECT 1 FROM ticket_transfers WHERE ticket_id=$1 AND state='PENDING'",[ticketId])).rowCount) fail('TRANSFER_PENDING','Ya existe una transferencia pendiente.');
    const token=randomToken(),id=randomUUID();
    const transfer=(await db.query<Transfer>(`INSERT INTO ticket_transfers(id,ticket_id,sender_id,sender_email,recipient_email,credential_version,request_key,token_hash,expires_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,now()+interval '48 hours') RETURNING *`,[id,ticketId,me.id,t.owner_email,email,t.credential_version,requestKey,digest(token)])).rows[0];
    await message(db,transfer,'INVITATION',email,token); await record(db,me,transfer,'initiated');
    return {id,state:transfer.state};
  });
}
export async function manageTransfer(id:string,action:'cancel'|'resend',p?:Principal) {
  const user=p||await currentIdentity('BUYER');
  if(!uuid(id)) fail('NOT_FOUND','Transferencia no encontrada.',404);
  await limit(`transfer-${action}`,user.id,{hits:action==='resend'?5:30,seconds:3600});
  return withTx(async db=>{
    await lockInventory(db); const me=await actor(db,user);
    const tr=(await db.query<Transfer>('SELECT * FROM ticket_transfers WHERE id=$1 FOR UPDATE',[id])).rows[0];
    if(!tr||tr.sender_id!==me.id) fail('NOT_FOUND','Transferencia no encontrada.',404);
    const t=await ticket(db,tr.ticket_id,true);
    if(t.owner_email!==me.email?.toLowerCase()||t.credential_version!==tr.credential_version) fail('NOT_FOUND','Transferencia no encontrada.',404);
    if(action==='cancel'&&tr.state==='CANCELLED') return {ok:true};
    if(action==='cancel') {
      if(tr.state!=='PENDING') fail('CLAIM_CANCELLED','La invitación ya no está pendiente.');
      await db.query("UPDATE ticket_transfers SET state='CANCELLED',cancelled_at=now() WHERE id=$1",[id]);
      await message(db,tr,'CANCELLED',tr.recipient_email); await record(db,me,tr,'cancelled');
    } else {
      pending(tr); eligible(t);
      // Rotation invalidates all previously sent invitations; expiry never extends.
      const token=randomToken(); tr.invitation_revision++;
      await db.query('UPDATE ticket_transfers SET token_hash=$2,invitation_revision=$3 WHERE id=$1',[id,digest(token),tr.invitation_revision]);
      await message(db,tr,'INVITATION',tr.recipient_email,token); await record(db,me,tr,'resent');
    }
    return {ok:true};
  });
}
async function claim(db:Db,token:string,me:Principal,lock=false) {
  if(!/^[a-f0-9]{64}$/.test(token)) fail('INVALID_CLAIM','Invitación inválida.',404);
  const tr=(await db.query<Transfer>(`SELECT * FROM ticket_transfers WHERE token_hash=$1 ${lock?'FOR UPDATE':''}`,[digest(token)])).rows[0];
  if(!tr) fail('INVALID_CLAIM','Invitación inválida.',404);
  if(tr.recipient_email!==me.email?.toLowerCase()) fail('WRONG_RECIPIENT','Inicia sesión con el correo que recibió la invitación.',403);
  pending(tr);
  const t=await ticket(db,tr.ticket_id,lock); eligible(t);
  if(t.owner_email!==tr.sender_email||t.credential_version!==tr.credential_version) fail('INVALID_CLAIM','La titularidad de esta entrada cambió.');
  return {tr,t};
}
export async function inspectTransferClaim(token:string,p?:Principal) {
  const user=p||await currentIdentity('BUYER'); await limit('transfer-claim',user.id,{hits:60,seconds:900});
  const me=await actor(pool,user),{tr,t}=await claim(pool,token,me);
  return {title:t.title,tier:t.ticket_type_name,expiresAt:tr.expires_at};
}
export async function acceptTransfer(token:string,p?:Principal) {
  const user=p||await currentIdentity('BUYER'); await limit('transfer-accept',user.id,{hits:20,seconds:900});
  return withTx(async db=>{
    await lockInventory(db); const me=await actor(db,user),{tr,t}=await claim(db,token,me,true);
    const version=t.credential_version+1;
    await db.query('UPDATE tickets SET owner_email=$2,credential_version=$3 WHERE id=$1',[t.id,me.email!.toLowerCase(),version]);
    await db.query("UPDATE ticket_transfers SET state='ACCEPTED',recipient_id=$2,accepted_at=now() WHERE id=$1",[tr.id,me.id]);
    await db.query('INSERT INTO ticket_ownership_history(ticket_id,sequence,owner_email,owner_id,transfer_id,acquired_at) VALUES($1,$2,$3,$4,$5,now())',[t.id,version,me.email!.toLowerCase(),me.id,tr.id]);
    // Pending or leased snapshots cannot be reused after a round-trip transfer.
    await db.query("UPDATE mail_jobs SET state='CANCELLED',lease_token=NULL WHERE purpose='TICKET' AND source_id=$1 AND state IN ('PENDING','SENDING')",[t.id]);
    await db.query("INSERT INTO mail_jobs(id,dedupe_key,purpose,source_id,recipient,credential_version) VALUES($1,$2,'TICKET',$3,$4,$5)",[randomUUID(),`transfer-ticket:${tr.id}`,t.id,me.email!.toLowerCase(),version]);
    await message(db,tr,'ACCEPTED',tr.sender_email); await message(db,tr,'ACCEPTED',tr.recipient_email);
    await record(db,me,tr,'accepted'); await record(db,me,tr,'credential_rotated');
    return {ok:true,ticketId:t.id};
  });
}
export async function transferDetail(ticketId:string,p?:Principal) {
  const me=await actor(pool,p||await currentIdentity('BUYER'));
  await limit('transfer-detail',me.id,{hits:120,seconds:60});
  const t=await ticket(pool,ticketId);
  const own=t.owner_email===me.email?.toLowerCase();
  const participant=await pool.query('SELECT 1 FROM ticket_transfers WHERE ticket_id=$1 AND (sender_id=$2 OR recipient_id=$2) AND state=\'ACCEPTED\' LIMIT 1',[ticketId,me.id]);
  if(!own&&!participant.rowCount) fail('NOT_FOUND','Entrada no encontrada.',404);
  const history=await pool.query(`SELECT h.sequence,h.owner_email,h.acquired_at,tr.created_at AS initiated_at FROM ticket_ownership_history h LEFT JOIN ticket_transfers tr ON tr.id=h.transfer_id WHERE h.ticket_id=$1 ORDER BY h.sequence DESC LIMIT 100`,[ticketId]);
  const tr=own?(await pool.query<Transfer>("SELECT * FROM ticket_transfers WHERE ticket_id=$1 AND state='PENDING' AND expires_at>now()",[ticketId])).rows[0]:null;
  return {own,eligible:own&&t.eligible,pending:tr?{id:tr.id,recipient:masked(tr.recipient_email),expiresAt:tr.expires_at.toISOString()}:null,
    history:history.rows.map(h=>({sequence:h.sequence,owner:h.owner_email===me.email?h.owner_email:masked(h.owner_email),acquiredAt:h.acquired_at.toISOString(),initiatedAt:h.initiated_at?.toISOString()||null}))};
}
