import 'server-only';
import type {PoolClient} from 'pg';
import {pool} from './db';
import {processMailJobs} from './mail/jobs.server';
import {reconcilePendingPayments} from './payments/reconcile.server';
import {cleanupMedia} from './media-lifecycle.server';
import {operationalLog} from './observability.server';

export type WorkerJob = 'mail' | 'payments' | 'media';
/** Trusted private runtime entry, never an HTTP route. Dedicated session locks
 * prevent scheduled overlap. Domain row leases/idempotency remain authoritative. */
export async function runWorkerBatch(job: WorkerJob, limit = 25) {
  const keys = {mail:7319341,payments:7319342,media:7319343};
  if (!Object.hasOwn(keys,job) || !Number.isSafeInteger(limit) || limit < 1 || limit > 100) throw new Error('Invalid worker batch');
  const started=Date.now();
  let client:PoolClient|undefined;
  let locked=false;
  try {
    client=await pool.connect();
    locked=!!(await client.query('SELECT pg_try_advisory_lock($1) AS locked',[keys[job]])).rows[0].locked;
    if (!locked) { operationalLog({action:'worker.busy',category:job,severity:'info'}); return {skipped:true}; }
    const result=job==='mail'?await processMailJobs({limit}):job==='payments'?await reconcilePendingPayments(limit):await cleanupMedia({limit});
    const failed=Array.isArray(result)?result.some(row=>row.outcome==='FAILED'):'failed' in result && result.failed>0;
    operationalLog({action:failed?'worker.failed':'worker.completed',category:job,severity:failed?'error':'info',durationMs:Date.now()-started});
    return result;
  } catch {
    operationalLog({action:'worker.failed',category:job,severity:'error',durationMs:Date.now()-started});
    throw new Error('Worker batch failed; inspect sanitized operational evidence');
  } finally {
    // A failed unlock destroys this connection instead of returning a session lock to the pool.
    let broken=false;
    if (locked && client) try { await client.query('SELECT pg_advisory_unlock($1)',[keys[job]]); } catch { broken=true; }
    client?.release(broken);
  }
}
