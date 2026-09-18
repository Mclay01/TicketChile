# Safe data migration strategy

No migration has been applied. `apps/web/sql/schema.sql` is a legacy bootstrap, not a reliable production schema.

1. Inventory all runtime SQL and collect a schema-only snapshot from a disposable local database or explicitly authorized read-only environment. Do not dump customer data or credentials.
2. Reconcile `users` versus `usuarios`, verification token foreign keys, admin tables, organizer verification/approval, publication columns, payment/buyer metadata and optional ticket email fields. The checked-in schema already has `tickets.ticket_type_id` despite the audit's contrary entry.
3. Add a versioned migration ledger with checksums and transactional migrations using the existing `pg` stack. Require an explicit local database URL for development/test commands, separate from application `.env.local`. Refuse remote targets in local test runners.
4. Baseline existing installations only after catalog checks. Do not execute legacy `CREATE IF NOT EXISTS` as a substitute for a migration or assume that it repairs existing tables.
5. Add new fields/tables first. Backfill in bounded batches with verification. Deploy compatible readers/writers before adding validated constraints. Never silently assign orphaned events/payments to an organizer.
6. Introduce event lifecycle/drafts, event-scoped staff, check-in actor log, password reset/MFA, audit records, promotions and financial ledger incrementally with dedicated migrations/tests.
7. Preserve unique order-per-hold, provider idempotency keys, row-lock inventory semantics, ticket history and existing IDs. Test duplicate callbacks, hold expiry and simultaneous scans against real local PostgreSQL.
8. Move base64 media through an object-storage abstraction with local development fallback; preserve existing media until verified copies and references exist. No destructive cleanup in this task.

Rollback is application compatibility plus additive forward fixes. Destructive migrations, production changes and credential rotations require explicit approval. No automated down migration may delete transactions or unknown customer data.

Current security containment uses existing session and ownership tables and requires no schema change. Financial policy (fees/tax/refund eligibility/settlement timing) must be configured or remain a documented pending decision.
