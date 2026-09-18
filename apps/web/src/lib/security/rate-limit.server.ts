import "server-only";
import { pool } from "@/lib/db";
import { privateDigest } from "./crypto.server";
import { AccessError } from "@/lib/access.server";

export type Limit = { hits: number; seconds: number };
export interface RateStore { consume(bucket: string, subject: string, limit: Limit): Promise<boolean> }
export const postgresRateStore: RateStore = {
  async consume(bucket, subject, limit) {
    const result = await pool.query<{ hits: number }>(`INSERT INTO security_rate_limits(bucket,subject_hash,window_start,hits,expires_at)
      VALUES ($1,$2,NOW(),1,NOW()+($3::int*interval '1 second'))
      ON CONFLICT(bucket,subject_hash) DO UPDATE SET
        hits=CASE WHEN security_rate_limits.expires_at<=NOW() THEN 1 ELSE LEAST(security_rate_limits.hits+1,$4+1) END,
        window_start=CASE WHEN security_rate_limits.expires_at<=NOW() THEN NOW() ELSE security_rate_limits.window_start END,
        expires_at=CASE WHEN security_rate_limits.expires_at<=NOW() THEN NOW()+($3::int*interval '1 second') ELSE security_rate_limits.expires_at END
      RETURNING hits`, [bucket,privateDigest(`rate:${bucket}:${subject}`),limit.seconds,limit.hits]);
    return result.rows[0].hits <= limit.hits;
  },
};
// Explicitly injected local/test store; never a silent production fallback.
export function memoryRateStore(now = () => Date.now()): RateStore {
  const values = new Map<string,{count:number;until:number}>();
  return { async consume(bucket,subject,limit) {
    const key = `${bucket}:${subject}`; let entry = values.get(key);
    if (!entry || entry.until <= now()) entry = {count:0,until:now()+limit.seconds*1000};
    entry.count++; values.set(key,entry); return entry.count<=limit.hits;
  } };
}
export async function limit(bucket: string, subject: string, policy: Limit, store = postgresRateStore) {
  if (!await store.consume(bucket,subject,policy)) throw new AccessError(429,"RATE_LIMITED","Demasiados intentos. Intenta mas tarde.");
}
export function networkSubject(request: Request) {
  // Only enable a header that the trusted ingress overwrites (never appends).
  const header = process.env.SECURITY_TRUSTED_IP_HEADER;
  const value = header ? request.headers.get(header) || "" : "";
  return value && /^[a-f0-9:.]{3,64}$/i.test(value) ? value : "unattributed";
}
export async function publicLimit(req: Request, bucket: string, subject?: string, policy: Limit = {hits:10,seconds:900}) {
  const network=networkSubject(req);
  // A missing trusted ingress header must not place the whole site behind a
  // single small per-IP allowance. Account limits still apply independently.
  await limit(`${bucket}:network`,network,network==="unattributed"?{hits:3000,seconds:60}:{hits:300,seconds:900});
  if (subject) await limit(bucket,subject.trim().toLowerCase(),policy);
}
