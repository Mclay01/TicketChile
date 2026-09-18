import 'server-only';
import type { PoolClient } from 'pg';

// One short transaction lock across all inventory writers. No provider I/O under
// this lock. This favors simple, testable correctness over high-volume scaling.
export async function lockInventory(client: PoolClient) {
  await client.query('SELECT pg_advisory_xact_lock(7319322)');
}
export async function releaseHoldTx(client: PoolClient, holdId: string) {
  await lockInventory(client);
  const claim = await client.query("UPDATE holds SET status='EXPIRED' WHERE id=$1 AND status='ACTIVE' RETURNING id",[holdId]);
  if (!claim.rowCount) return;
  await client.query(`UPDATE ticket_types tt SET held=tt.held-hi.qty FROM hold_items hi
    WHERE hi.hold_id=$1 AND tt.event_id=hi.event_id AND tt.id=hi.ticket_type_id`,[holdId]);
}
export async function expireHoldsTx(client: PoolClient) {
  await lockInventory(client);
  const expired = await client.query("SELECT id FROM holds WHERE status='ACTIVE' AND expires_at<=NOW() ORDER BY id FOR UPDATE");
  for (const hold of expired.rows) await releaseHoldTx(client,hold.id);
}
