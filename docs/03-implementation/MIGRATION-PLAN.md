# Versioned migration strategy ? M3

Only disposable local PostgreSQL databases have been created/migrated. No existing or production database was dropped, recreated, inspected or changed. `apps/web/sql/schema.sql` remains a legacy bootstrap, not an authoritative production snapshot.

## Reconstructed baseline and inventory

The baseline was reconstructed from application queries in auth/signup/verification, admin operations, organizer services, hold creation, checkout finalization, ticket delivery and provider payment routes, checked against the old SQL and M1/M2 test contracts. The runnable local schema resolves `usuarios` UUID identities versus the obsolete `users` verification foreign key, adds the runtime admin tables, organizer email/phone/verification/approval, event publication, ticket-type slug/order limits, buyer contact metadata and optional ticket email fields. It preserves event/order/hold/ticket IDs, composite ticket-type keys, unique order/payment per hold and provider reference/webhook idempotency keys.

It is an explicitly reconstructed development contract, **not proof of the deployed schema**. Existing table names, types, nullability, defaults, keys, indexes, collation/case handling and trigger assumptions still require reconciliation against an authorized catalog snapshot before production adoption.

| Version | Structures |
| --- | --- |
| `0001_runtime_baseline.sql` | Fresh-local legacy/runtime tables: usuarios, verification tokens, admin/organizer users and legacy sessions, organizer submissions/event ownership, events/ticket types, holds/items, orders/tickets, payments/webhook events; runtime additive columns listed above |
| `0002_identity_security.sql` | Admin active/role/recovery-email fields; buyer active state; identity_accounts/principals view/insert triggers, hashed identity_sessions and identity_tokens, encrypted identity_mfa and security_outbox; organizer_staff and organizer_invites; security_rate_limits; append-only security_audit; holds.owner_email and supporting indexes |
| `0003_capability_policy.sql` | Role capability function, membership/invitation capability-subset constraints and live tenant/event authorization function |
| `0004_payment_lifecycle.sql` | Durable provider verification/creation/fulfillment fields, request/intent uniqueness, payment_evidence, ticket issuance slots and encrypted delivery job ledger |

The runner stores `schema_migrations(version, checksum, applied_at)`, uses an advisory lock and per-file transaction with a five-second lock timeout. Checksums normalize CRLF to LF so Windows/Linux checkouts agree. Applied-file edits, unknown ledger versions and out-of-order insertions fail. A failed migration rolls back its DDL and ledger row. No automatic down migrations exist.

## Safe local commands

Run from `apps/web`. PostgreSQL binaries must be installed; the repository does not install or start a system service.

1. `node scripts/local-db.mjs start` initializes an ignored disposable cluster only if absent, binds `127.0.0.1:55439` and retains its files under root `.local/`. It clears inherited PG environment variables and never loads application env files. Local trust auth is exclusively for disposable fixtures; never use it with real data.
2. `node --test --experimental-test-isolation=none tests/security.integration.test.mjs` creates a uniquely named `ticketchile_test_m3_*` database per run, applies migrations, seeds synthetic identities and closes its pools. It never loads `.env.local`, uses a fixed loopback server/user/port and never drops a database. Old fixture databases are retained for inspection.
3. For a separate local development database, explicitly create a **new** `ticketchile_local_*` database, set `MIGRATION_DATABASE_URL` to its loopback URL, then run `node scripts/migrate.mjs`. The CLI refuses remote hosts, URL query options and other database names. It never uses DATABASE_URL/application credential fallbacks.
4. `node scripts/bootstrap-local.mjs` uses that same explicit local-only URL and JSON on stdin (`kind`, `login`, `email`, `password`) to provision a synthetic ADMIN/SUPERADMIN or ORGANIZER owner. Do not put passwords in command-line arguments. It never overwrites an existing identity; MFA is required at first login. This replaces retired HTTP bootstrap/provisioning.
5. `node scripts/security-inbox-local.mjs` additionally needs the local `SECURITY_DATA_KEY`; it writes decrypted test messages to ignored `.local/security-inbox.json` without sending email or printing secrets. Delete/protect this local credential file according to your workstation policy.
6. `node scripts/local-db.mjs stop` stops only this explicit cluster and retains all local data. Do not run the cluster against a production data directory.

The integration helper creates empty databases rather than dropping/recreating any existing database. Production migration execution is deliberately not exposed by these local commands.

## Existing-installation adoption procedure ? not executed

The runner refuses baseline adoption if it finds existing public application tables without a ledger. It may create the empty ledger, but makes no application-table changes in this case. Do not bypass this by blindly inserting a baseline marker.

1. Obtain an explicitly authorized schema-only catalog snapshot, backup/restore evidence, actual PostgreSQL version, row counts and duplicate/orphan reports without extracting customer payloads into the repository.
2. Compare it with the reconstructed baseline. Resolve `users`/`usuarios`, FK types, required columns, publication state, nullable buyer/email fields and optional columns. Preserve every existing transaction and unknown object. Check normalized duplicate usernames/emails, orphan ownership and duplicate event owners; do not assign owners or merge identities automatically.
3. Write a reviewed, versioned, additive reconciliation migration for the actual catalog. If a column/object already exists, verify its full definition rather than hiding drift with blanket IF NOT EXISTS. Validate potentially expensive constraints/indexes in bounded steps. Rehearse on an anonymized restored copy, including rollback/lock duration.
4. Only after exact catalog comparison and explicit operator review, record the corresponding reviewed baseline checksum and apply additive security migrations under a separate migration role. The default local CLI will continue refusing remote execution; a future production runner/runbook must be separately reviewed.
5. M3 backfills only security identity rows from existing source users; it does not rewrite passwords, transfer tickets, infer hold owners, manufacture verified recovery emails, assign SUPERADMIN or grant staff. Defaults retain active legacy accounts but require MFA for admin/owner use. Reconcile legitimate suspended accounts before rollout. Existing admins default to ADMIN; separately authorize superadmin/recovery-email provisioning.
6. Deploy the schema before the M3 application, configure a managed data key and trusted ingress settings, arrange secure mail delivery and privileged MFA onboarding, and announce session invalidation. Test source-row inserts with the new identity triggers and identity disabling/role changes. Keep old session/token tables for history; the new application does not accept their credentials.
7. Legacy holds with NULL owner cannot be reused. Let short-lived holds expire/release safely or perform a separately reviewed evidence-based backfill; never claim a hold based only on its ID. Verify that no old writer can continue creating unowned holds after rollout.

## Compatibility, rollback and production risks

Legacy password encodings are read and progressively upgraded after successful login. Account identifiers and financial tables remain; schema.sql is not executed by the runner. Old sessions/JWTs and short organizer verification codes are intentionally invalidated by the new readers; unverified accounts can request a new shared verification token. This is an authentication compatibility break requiring coordinated rollout, not an invisible migration.

There is no destructive rollback. Prefer forward repairs; do not revert into retired authentication bypasses or drop identity/audit/financial records. An old binary does not understand new session/hash formats. Preserve the encryption key, token/session version state and audit history during recovery. Test a backup restore before any production migration; never rotate the key without a ciphertext re-encryption plan.

Production assumptions remain untested: deployed schema drift, data quality, lock/index cost, database version/extensions, runtime versus migration privileges, trigger protection, key management, trusted proxy configuration, MFA onboarding, recovery-email proof, email worker and retention. Audit triggers deter application UPDATE/DELETE but cannot constrain a database owner/TRUNCATE; use restricted runtime grants and external archival. Load-test scrypt memory and DB-backed rate counters. Local verification used PostgreSQL 18.1 only.

Future migrations append new numbered files; never edit an applied migration. Financial policy remains pending; M4 lifecycle migration details follow.


## M4 additive migration and adoption risks

`0004_payment_lifecycle.sql` appends to the unchanged M1-M3 migration files. New payment fields separate verified evidence, fulfillment and uncertain creation; request-key and provider-intent uniqueness are partial indexes. `payment_evidence` deduplicates provider observations. Existing ticket IDs are preserved; deterministic row-number backfill assigns issuance slots, then a unique order/type/slot index prevents duplicate new issuance. `mail_jobs` stores source references, recipient, encrypted payload snapshot, lease/fencing state, attempt timestamps and explicit TEST/RESEND delivery transport. Existing `security_outbox` remains intact.

The migration deliberately does not certify old PAID rows by filling `verified_at`. Existing linked paid orders are marked ISSUED; provider references imply READY creation, while other legacy attempts remain UNKNOWN. Legacy pending manual transfers are not automatically paid or approved. No buyer/hold owners, provider references or historical financial evidence are fabricated. Application rollout requires schema first and coordinated retirement of every old inventory/payment writer.

Rehearse the ticket backfill and unique index lock/cost on a restored authorized catalog. Check inconsistent owner/hold/payment/event links, existing oversold/negative inventory, duplicate type slots and out-of-band tickets before adoption. Strict finalization rejects inconsistent records rather than masking them with GREATEST or rewriting owners. Review pending legacy Stripe sessions (client-reference/metadata binding), unknown create outcomes and active provider returns before deploying the new callback validation. Existing transactions may require a reviewed provider-backed reconciliation; never simply stamp them verified.

Production scheduler installation, merchant configuration, verified mail sender, review/refund operations and pending-message retention/key management remain prerequisites, not performed migrations. This milestone ran only disposable local PostgreSQL 18.1 databases; no production catalog was read or changed. See [PAYMENTS.md](PAYMENTS.md) for the operational sequence and compatibility limits.


## M5 discovery and media migration

`0005_discovery_media.sql` is additive: `event_categories` with seven approved discovery labels, nullable `events.category_slug` foreign key, publication/date/category indexes and `media_objects` metadata (tenant/event, immutable object key, raster content type, bounded byte count, creation time). No binary image payload is stored in the new table. Existing events are not automatically categorized, and their image/hero strings are untouched. Applied migrations 0001-0004 were not edited. The fresh-local migration ledger, idempotency and rollback tests now include five migrations.

Apply the reconciled schema before this app version. Existing unknown production schema still requires the reviewed adoption procedure above; none was inspected or migrated here. Rehearse index locks and foreign-key compatibility on an authorized restored catalog.

Future uploads now use the authorized binary endpoint and immutable storage abstraction. The included adapter is local development only (`apps/web/.local/media`) and rejects production mode. A production implementation must add a reviewed object/blob adapter with explicit credentials, bounded operations, private staging objects, controlled publication reads, monitoring and orphan/retention policy. Do not use local disk as an automatic production fallback. No production storage request was made.

Legacy base64 raster strings remain compatible via a read-only publication-checked binary reader. Unsupported remote/SVG media uses a placeholder; no unrestricted optimizer domain list was added. Historical pending submissions may still contain old image strings; new submissions accept only tenant-owned media references.

A future legacy transition must be separately authorized: inventory references and ownership, validate/re-encode approved rasters, create immutable objects and metadata, verify sizes/checksums/rendering, then update each reference transactionally with an audit trail. Retain original references and backups until an approved retention decision; never bulk-delete or rewrite production images from this milestone's scripts. Interrupted uploads can leave unreachable local objects if metadata persistence fails; automatic cleanup is intentionally absent.

## M6 event lifecycle migration

Append `0006_event_lifecycle.sql`; migrations 0001–0005 remain unchanged. The disposable runner/checksum/rollback tests now include six versions (the deliberately failing test migration is numbered 0007 only inside its temporary fixture directory).

Add lifecycle, revision/update time, nullable draft start, end/timezone, address/region, age/access text, visibility, event capacity, FAQ and cancellation follow-up to events; add description, sales windows and visible/active flags to tiers. Existing publication maps to PUBLISHED/DRAFT and existing tier capacities sum into event capacity. No missing dates/addresses/legal rules/categories are inferred. Existing tier default visibility/activity preserves prior behavior. No order, sold/held count, ticket price snapshot, media bytes or pending submission is rewritten or deleted.

A check binds the compatibility publication boolean to lifecycle. Legacy inserts initialize state from their existing boolean; legacy publication updates are rejected. Apply the reconciled migration before this app version, and update fixtures/seeding accordingly. The new application creates only DRAFT events and retires legacy publication/submission mutation endpoints. Pending submissions need a deliberate M9 import/review; no automatic conversion occurs.

Before any production adoption: inventory the real catalog and summed capacities, reconcile incompatible prior constraints/columns, rehearse event-table locks and indexes, verify grandfathered event dates/media/tier windows, and plan deployment order so old boolean writers cannot race the new constraint. Rollback is a reviewed forward repair, not dropping columns, deleting history or re-enabling an unsafe publication route. No production schema or data was accessed in M6.
