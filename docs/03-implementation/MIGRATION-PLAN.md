# Versioned migration strategy ? M3

Current release status (M10): see [RELEASE-READINESS.md](RELEASE-READINESS.md) and [M10-AUDIT.md](M10-AUDIT.md). Milestone-specific test counts and handoffs below are historical. No production release is certified.

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


## M7 migration 0007

Append `0007_ai_proposals.sql` after 0006; applied migrations 0001-0006 are unchanged. Adds event short_description/seo_title/seo_description with empty defaults, ai_requests (correlation, scope, state, encrypted validated output, usage and expiry), and ai_simulator_sessions (hashed browser capability, encrypted temporary draft, exact actor binding and consumed event). Indexes support expiry operations. No existing event/inventory/payment state is transformed. Fresh/idempotent application, checksum protection and rollback are verified on disposable local PostgreSQL. Production rehearsal, runtime grants, key management and physical expired-data retention scheduling remain operator prerequisites; this milestone applies nothing to production.


## M8 migration 0008

Append `0008_event_operations.sql`; migrations 0001-0007 remain byte-for-byte unchanged. Adds promotions, immutable per-hold promotion reservations, original hold-item price snapshots, complimentary issuance/revocation metadata, unique append-only check-in records, access configuration and event/tier/order/export indexes. Replaces role-ceiling/policy functions to recognize explicitly granted new operations without changing existing staff grants. No historical ticket/payment status, identity, price or inventory counter is rewritten.

Fresh, idempotent, checksum and rollback tests now cover eight versions, with the deliberate failed test migration numbered 0009 in a temporary fixture directory only. PostgreSQL integration proves discount/usage/inventory/check-in concurrency and immutable history. Production adoption still requires an authorized catalog/grants/index-lock rehearsal and migration-before-application sequencing; no production schema or credentials were accessed. Rollback is a reviewed forward repair, not deletion of operations history or restoration of legacy unsafe routes.


## M9 adoption: 0009_admin_finance.sql

Additive migration after 0008. Prior migration sources remain unchanged. Adds persisted admin capabilities and live policy function; organizer business-review state backfilled from existing active/approval flags; event moderation block; immutable admin decisions, commission versions and payment-finance snapshots; refund/ticket/evidence records; settlement lines/claims/adjustments/external payout records; support cases/notes and bounded-queue indexes.

The payment insert trigger captures only new purchases. No historical commission is invented, no existing paid evidence is certified, no legacy submission is published and no external provider is called. Existing missing financial policy intentionally blocks settlement preparation. Review an explicit historical accounting adoption procedure separately; do not fill old purchases using today's rates or temporarily disable immutability triggers to make an export appear complete.

Production process: review actual catalog and existing function/trigger ownership; back up and restore to a rehearsal environment; apply 0009 once through the existing checksum/transaction runner; review row counts and review-state mapping, runtime grants on new tables/functions, index plans, rollback and worker/webhook order; deploy compatible code only after adoption. Keep refund execution disabled until dedicated test-merchant certification and approved operational policy. Never apply this document as authorization to access production. Local tests exercise migrations through 0009, idempotency, checksum drift and complete rollback of a synthetic failing 0010.

Rollback is a reviewed restore/code-adoption procedure once new financial records exist; do not drop evidence tables to roll back. No automatic legacy financial backfill or production migration was performed during M9.

## M10 rehearsal outcome

No schema migration was added and no applied file 0001-0009 was edited. `release-migrations.integration.test.mjs` applies all nine migrations to an empty disposable PostgreSQL database, and separately applies only the immutable 0001 baseline, inserts synthetic historical orders/tickets/PAID payment data, then applies 0002-0009 twice. Ownership/status survive, ticket issuance slots backfill uniquely, old PAID remains unverified and no commission history is invented. Existing tests still reject checksum drift, out-of-order/unknown migrations and unbaselined existing tables, and roll back failed DDL. This is reconstructed baseline evidence, not a production snapshot. Actual catalog reconciliation, backups/restore and an approved remote executor remain required; the checked-in migration runner intentionally permits loopback only.


## M11 adoption: 0010_ticket_transfers.sql

Append immutable version 0010 after 0009. Files 0001-0009 remain unchanged. Adds buyer phone, nonnegative ticket credential_version (existing/new initial generation zero), event transfer policies, tier disabling, durable transfer claims/messages, uniqueness for pending ticket and sender/request keys, indexed history, append-only ownership transitions and initial-owner insertion trigger. M4 mail jobs gain TRANSFER purpose and credential generation binding. Existing jobs receive zero.

No transfer policy is inserted. Existing ticket/payment status, paid evidence and payment/order owner remain unchanged. History sequence zero snapshots the canonical owner at adoption; unknown earlier transfers are not reconstructed as original issuance evidence. tc1 stays valid at zero and becomes invalid on first transfer; tc2 signs the current generation. Readiness now requires ten migration versions. Legacy baseline, empty/idempotent adoption, drift and failure rollback are tested locally; the synthetic failure migration is 0011 in a temporary test directory.

Before any separately authorized production adoption, reconcile actual catalog/ownership, back up and restore, rehearse lock/index/backfill cost and history triggers, verify runtime grants and mail/scanner worker version sequencing, and approve policies. Deploy all scanner aliases and workers with generation support before enabling any policy. After a transfer exists, old scanner code is unsafe to restore; use a forward-compatible repair or suspend affected admission/transfer. Never drop ownership/audit records or reset credential generations to roll back. No production migration was run.
# M12 / 0011 media lifecycle addendum

Append `0011_media_lifecycle.sql`; migrations 0001–0010 remain unchanged. Readiness
now expects eleven versions. It extends `media_objects` with purpose, provider/store
identity, dimensions/hash, creator/idempotency, recovery state and cleanup timing;
adds immutable variant metadata and a private legacy-adoption journal; adds an event
reference trigger that locks assets, refuses non-READY attachments and tracks
detachment. Existing rows remain local READY objects with nullable purpose/dimensions,
so their references and bytes are not rewritten by the schema migration.

Schema application does **not** upload, rewrite base64 or delete any media. New
storage intent precedes object writes. Event replacement continues to use the M6
revision and transaction boundary. All retained event references protect assets.
Adoption stores original base64 and checksum privately, verifies actual object bytes,
then conditionally updates only the still-matching field/revision. It never changes
slug/publication. Dry run and bounded checkpoint/resume are documented in
[MEDIA-ARCHITECTURE.md](MEDIA-ARCHITECTURE.md).

Production procedure remains separately approved: catalog reconciliation, DB/object
backup and restore rehearsal, 0011 on a sanitized clone, preview-only storage checks,
dry-run inventory, reviewed batch sizes/checkpoints, failure/conflict review, and
comparison of current/private/public/admin images. Do not remove legacy readers or
original values until adoption and rollback have been verified. To roll back one
adoption, lock the event and media and require its current field still equals the
mapped asset before restoring `original_value` and increasing revision. Never
overwrite later edits. Retain the metadata migration and audit/journal history.
No production schema, base64 or object-store operation occurred in M12.

## M13 fresh, legacy, backup and restore evidence

No migration was added or edited: 0001-0011 remain immutable. Full regression reruns
empty, reconstructed 0001 legacy, populated M11 media, repeat/checksum/drift/order
and failed-DDL cases. `m13-restore-rehearsal.mjs` additionally creates two new synthetic
loopback databases, applies all eleven migrations, exercises real payment issuance
and transfer acceptance, commission snapshots and bounded legacy media adoption,
then performs custom-format pg_dump and fresh-target pg_restore. All 58 table
count/hash snapshots match; 73 validated foreign keys, current-owner application
reads, payer ownership, credential/history, AI ciphertext and media hashes survive.
See [qa/m13/restore-report.json](qa/m13/restore-report.json). Object bytes and encryption
keys are backed up separately from SQL; local success is not managed production PITR.

`staging-migrate.mjs --apply` is an explicit Preview-only remote executor with exact
DB/origin/resource/TLS binding and no env-file/application URL fallback. It shares
the immutable transactional runner and refuses unledgered application tables. It
was prepared, not run against a remote account. Production remains unsupported by
this CLI; actual catalog reconciliation, role grants, manual baseline adoption and
provider-specific backup/restore require separate reviewed execution. Exact steps
and remaining authority requirements: [STAGING-RUNBOOK.md](STAGING-RUNBOOK.md).

A local M12 artifact was rebuilt in its original Turbopack mode and served the restored
0011 schema without reversing migrations. The local dependency-root packaging override
is documented in the rehearsal script. An attempted alternate webpack build exposed
a legacy generated PageProps mismatch; the approved Turbopack pipeline passed. Do not
substitute builders without verification. M12 lacks M13 operational isolation controls,
so external providers/workers must remain disabled during that emergency fallback.
