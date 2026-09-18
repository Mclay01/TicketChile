import 'server-only';
import { randomUUID, createHash } from 'node:crypto';
import { pool, withTx } from '@/lib/db';
import { AccessError } from '@/lib/access.server';
import { TICKET_OWNER_SQL } from '@/lib/buyer-guard.server';
import { renderTicketQr } from '@/lib/qr-render.server';
import { buildTicketEmail } from '@/lib/tickets.email';
import { seal, unseal } from '@/lib/security/crypto.server';
import { audit } from '@/lib/security/audit.server';
import { mailConfigured, sendTransactionalMail, type Mail, type MailTransport } from '@/lib/mail/transport.server';
type Job={id:string;purpose:'TICKET'|'SECURITY';source_id:string;recipient:string;payload_cipher:string|null;lease_token:string;first_attempt_at:Date|null};
async function ticketRow(ticketId:string,recipient:string) {
  return (await pool.query(`SELECT t.*,${TICKET_OWNER_SQL} AS recipient,o.buyer_name,o.buyer_email,o.event_title,e.city,e.venue,e.date_iso
    FROM tickets t JOIN orders o ON o.id=t.order_id JOIN events e ON e.id=t.event_id
    WHERE t.id=$1 AND ${TICKET_OWNER_SQL}=$2 AND t.status='VALID'
    AND EXISTS(SELECT 1 FROM payments p WHERE p.hold_id=o.hold_id AND p.status='PAID' AND p.order_id=o.id)`,[ticketId,recipient])).rows[0];
}
/** Current owner, valid ticket and persisted paid order are all required. A
 * rolling 15-minute bucket suppresses double-click/reload resend bursts. */
export async function queueTicketResend(ticketId:string,email:string) {
  const ticket=await ticketRow(ticketId,email);
  if(!ticket) throw new AccessError(404,'NOT_FOUND','Entrada no encontrada.');
  const recipientHash=createHash('sha256').update(email).digest('hex');
  const result=await pool.query(`INSERT INTO mail_jobs(id,dedupe_key,purpose,source_id,recipient)
    VALUES($1,$2,'TICKET',$3,$4) ON CONFLICT(dedupe_key) DO UPDATE SET dedupe_key=EXCLUDED.dedupe_key RETURNING id,state`,
    [randomUUID(),`resend:${ticketId}:${recipientHash}:${Math.floor(Date.now()/900000)}`,ticketId,email]);
  return {queued:true,state:result.rows[0].state};
}
/** Import existing encrypted M3 security messages without replacing or deleting
 * their source. The actual message is decrypted only for delivery. */
export async function importSecurityMail() {
  const sources=await pool.query("SELECT id,payload_cipher FROM security_outbox WHERE delivered_at IS NULL AND expires_at>NOW() ORDER BY created_at LIMIT 100");
  for(const source of sources.rows) {
    const payload=JSON.parse(unseal(source.payload_cipher,`mail:${source.id}`));
    await pool.query(`INSERT INTO mail_jobs(id,dedupe_key,purpose,source_id,recipient) VALUES($1,$2,'SECURITY',$3,$4) ON CONFLICT DO NOTHING`,
      [randomUUID(),`security:${source.id}`,source.id,payload.to]);
  }
}
function escape(value:string) {return value.replace(/[<>&"']/g,c=>({'<':'&lt;','>':'&gt;','&':'&amp;','"':'&quot;',"'":'&#39;'}[c]!));}
async function authorizeAndBuild(job:Job):Promise<Mail|null> {
  if(job.purpose==='TICKET') {
    const ticket=await ticketRow(job.source_id,job.recipient);
    if(!ticket) return null;
    if(job.payload_cipher) return JSON.parse(unseal(job.payload_cipher,`delivery:${job.id}`));
    const png=await renderTicketQr(ticket);
    return buildTicketEmail({to:[job.recipient],ticket:{id:ticket.id,status:ticket.status,ticketTypeName:ticket.ticket_type_name,qrPngBase64:png.toString('base64')},
      order:{id:ticket.order_id,buyerName:ticket.buyer_name,buyerEmail:job.recipient,ownerEmail:job.recipient},
      event:{id:ticket.event_id,title:ticket.event_title,city:ticket.city,venue:ticket.venue,dateISO:new Date(ticket.date_iso).toISOString()}});
  }
  const source=(await pool.query('SELECT * FROM security_outbox WHERE id=$1 AND delivered_at IS NULL AND expires_at>NOW()',[job.source_id])).rows[0];
  if(!source) return null;
  if(job.payload_cipher) return JSON.parse(unseal(job.payload_cipher,`delivery:${job.id}`));
  const message=JSON.parse(unseal(source.payload_cipher,`mail:${source.id}`));
  if(message.to!==job.recipient) return null;
  // Existing security form accepts the token for reset, verification and invite
  // acceptance. Do not put a bearer token into an untrusted redirect URL.
  return {from:process.env.FROM_EMAIL||'',to:[job.recipient],subject:'TicketChile: '+message.purpose,
    html:`<p>Solicitud de seguridad: ${escape(message.purpose)}</p><p>Usa este codigo en el formulario de seguridad de TicketChile:</p><pre>${escape(message.token)}</pre><p>Vence: ${escape(message.expiresAt)}</p>`};
}
/** Bounded lease + immutable encrypted payload + provider dedupe. No unbounded
 * retry of uncertain sends after Resend's 24-hour idempotency window. */
export async function processMailJobs(options:{transport?:MailTransport;limit?:number}={}) {
  if(!options.transport && !mailConfigured()) return {attempted:false,sent:0,failed:0};
  const send=options.transport||sendTransactionalMail;
  let sent=0,failed=0;
  await importSecurityMail();
  for(let i=0;i<Math.min(options.limit||25,100);i++) {
    const token=randomUUID();
    const job=await withTx(async client=>{
      const row=(await client.query<Job>(`SELECT * FROM mail_jobs WHERE
        (state='PENDING' AND next_attempt_at<=NOW()) OR (state='SENDING' AND lease_until<NOW())
        ORDER BY created_at LIMIT 1 FOR UPDATE SKIP LOCKED`)).rows[0];
      if(!row) return null;
      if(row.first_attempt_at && Date.now()-new Date(row.first_attempt_at).getTime()>23*3600000) {
        await client.query("UPDATE mail_jobs SET state='REVIEW' WHERE id=$1",[row.id]);
        await audit(client,{actor:{kind:'SYSTEM',id:'mail-worker'},action:'mail.delivery_review',targetType:'mail',targetId:row.id,metadata:{outcome:'DEDUPE_WINDOW_EXPIRED'}});
        return {review:true} as const;
      }
      await client.query(`UPDATE mail_jobs SET state='SENDING',lease_token=$2,lease_until=NOW()+interval '2 minutes',attempts=attempts+1 WHERE id=$1`,[row.id,token]);
      return {...row,lease_token:token};
    });
    if(!job) break;
    if('review' in job) continue;
    try {
      const mail=await authorizeAndBuild(job);
      if(!mail) {
        await pool.query("UPDATE mail_jobs SET state='CANCELLED' WHERE id=$1 AND lease_token=$2",[job.id,token]);
        continue;
      }
      // Persist exact payload before the first external call. Retry sends the
      // same bytes even if event details or signing timestamps have changed.
      const claimed=await pool.query(`UPDATE mail_jobs SET payload_cipher=COALESCE(payload_cipher,$3),first_attempt_at=COALESCE(first_attempt_at,NOW())
        WHERE id=$1 AND lease_token=$2 AND lease_until>NOW() RETURNING id`,[job.id,token,seal(JSON.stringify(mail),`delivery:${job.id}`)]);
      if(!claimed.rowCount) continue;
      await send(mail,`mail:${job.id}`);
      await withTx(async client=>{
        const updated=await client.query("UPDATE mail_jobs SET state='SENT',sent_at=NOW(),lease_until=NULL,delivery_transport=$3 WHERE id=$1 AND lease_token=$2 RETURNING id",[job.id,token,options.transport?'TEST':'RESEND']);
        if(updated.rowCount && job.purpose==='SECURITY') await client.query('UPDATE security_outbox SET delivered_at=NOW() WHERE id=$1',[job.source_id]);
      });
      sent++;
    } catch {
      failed++;
      await withTx(async client=>{
        await client.query("UPDATE mail_jobs SET state='PENDING',lease_until=NULL,next_attempt_at=NOW()+interval '1 minute' WHERE id=$1 AND lease_token=$2",[job.id,token]);
        await audit(client,{actor:{kind:'SYSTEM',id:'mail-worker'},action:'mail.delivery_failed',targetType:'mail',targetId:job.id,metadata:{outcome:'RETRY_REQUIRED'}});
      });
    }
  }
  return {attempted:true,sent,failed};
}
