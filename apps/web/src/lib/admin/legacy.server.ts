import 'server-only';
import {pool} from '@/lib/db';
import {requireAdminCapability,operation,fail,type OperationInput} from './policy.server';
import type {Principal} from '@/lib/security/identity.server';
import type {AdminRow} from './queries.server';
export async function legacySubmissions(page=1){
 const p=await requireAdminCapability('operations.read');
 const rows=(await pool.query(`SELECT id,organizer_id,status,created_at,left(payload->>'title',200) AS name FROM organizer_event_submissions WHERE status='IN_REVIEW' AND security_can_admin($1,$2,$3,'operations.read') ORDER BY created_at,id LIMIT 51 OFFSET $4`,[p.kind,p.id,p.version,(Math.max(1,Math.min(1000,Math.floor(page)||1))-1)*50])).rows;
 return {rows:JSON.parse(JSON.stringify(rows.slice(0,50))) as AdminRow[],hasMore:rows.length>50};
}
export async function resolveLegacy(input:OperationInput,actor?:Principal){
 return operation(input,'moderation.write',async(db)=>{
  if(!['REJECTED','NEEDS_INFORMATION'].includes(String(input.state)))fail('Resolución inválida.');
  const r=await db.query("SELECT status FROM organizer_event_submissions WHERE id=$1 FOR UPDATE",[input.target]);if(!r.rowCount||r.rows[0].status!=='IN_REVIEW')fail('Solicitud no disponible.');
  // Baseline table only supports terminal rejection; request-information leaves it in review.
  if(input.state==='REJECTED')await db.query("UPDATE organizer_event_submissions SET status='REJECTED',review_notes=$2 WHERE id=$1",[input.target,input.reason]);
  return {value:{id:input.target},previous:r.rows[0].status,next:String(input.state)};
 },actor);
}
