import { privateJson } from '@/lib/access.server';
import { coreConfigurationIssues } from '@/lib/runtime-config.server';
export const dynamic = 'force-dynamic';
// Deployment readiness, not provider certification. Exposes no dependency names.
export async function GET() {
  if (coreConfigurationIssues().length) return privateJson(503, { ready: false });
  try {
    const { pool } = await import('@/lib/db');
    // The deploy procedure additionally verifies checksums before traffic is enabled.
    const ledger = await pool.query('SELECT version FROM schema_migrations ORDER BY version');
    const expected = ['0001_runtime_baseline.sql','0002_identity_security.sql','0003_capability_policy.sql','0004_payment_lifecycle.sql','0005_discovery_media.sql','0006_event_lifecycle.sql','0007_ai_proposals.sql','0008_event_operations.sql','0009_admin_finance.sql','0010_ticket_transfers.sql','0011_media_lifecycle.sql'];
    const ready = ledger.rows.length === expected.length && ledger.rows.every((r, i) => r.version === expected[i]);
    return privateJson(ready ? 200 : 503, { ready });
  } catch { return privateJson(503, { ready: false }); }
}
