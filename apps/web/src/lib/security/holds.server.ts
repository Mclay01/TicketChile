import "server-only";
import type { PoolClient } from "pg";
import { AccessError } from "@/lib/access.server";
export const HOLD_TTL_SECONDS=480;
/** Call before inventory locks, within the same transaction as hold insertion. */
export async function enforceHoldBudget(client:PoolClient,email:string,quantities:number[]){
  if(!email)throw new AccessError(401,"UNAUTHENTICATED","Inicia sesion para reservar.");
  if(!quantities.length||quantities.length>10||!quantities.every(q=>Number.isSafeInteger(q)&&q>0)||quantities.reduce((a,b)=>a+b,0)>10)
    throw new AccessError(400,"HOLD_QUANTITY","Maximo 10 entradas por reserva.");
  await client.query("SELECT pg_advisory_xact_lock(hashtextextended($1,0))",[`hold:${email}`]);
  const result=await client.query<{count:string;qty:string}>(`SELECT COUNT(DISTINCT h.id)::text AS count,COALESCE(SUM(hi.qty),0)::text AS qty
    FROM holds h LEFT JOIN hold_items hi ON hi.hold_id=h.id
    WHERE h.owner_email=$1 AND h.status='ACTIVE' AND h.expires_at>NOW()`,[email]);
  const row=result.rows[0];
  if(Number(row.count)>=3||Number(row.qty)+quantities.reduce((a,b)=>a+b,0)>20)
    throw new AccessError(429,"HOLD_LIMIT","Completa tus reservas pendientes o espera su vencimiento.");
}
export async function requireHoldOwner(client:PoolClient,holdId:string,email:string){
  const result=await client.query("SELECT id FROM holds WHERE id=$1 AND owner_email=$2 FOR UPDATE",[holdId,email]);
  if(!result.rowCount)throw new AccessError(404,"NOT_FOUND","Reserva no encontrada.");
}
