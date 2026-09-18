import "server-only";
import type { Pool, PoolClient } from "pg";
export type Actor = { kind: "BUYER" | "ORGANIZER" | "ADMIN" | "SYSTEM"; id: string };
export type AuditEntry = {
  actor: Actor; action: string; targetType: string; targetId?: string;
  organizerId?: string; eventId?: string; metadata?: { role?: string; capability?: string; outcome?: string; provider?: string };
};
export async function audit(client: Pool | PoolClient, entry: AuditEntry) {
  // Explicit allowlist: never serialize a request, credentials or an arbitrary row.
  const metadata = Object.fromEntries(Object.entries(entry.metadata || {}).filter(([key, value]) =>
    ["role", "capability", "outcome", "provider"].includes(key) && typeof value === "string" && value.length <= 80));
  await client.query(`INSERT INTO security_audit(actor_kind,actor_id,organizer_id,event_id,action,target_type,target_id,metadata)
    VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb)`, [entry.actor.kind, entry.actor.id, entry.organizerId || null,
    entry.eventId || null, entry.action, entry.targetType, entry.targetId || null, JSON.stringify(metadata)]);
}
