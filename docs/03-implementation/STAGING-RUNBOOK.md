# M13 isolated staging and operational rehearsal

This authorizes neither production deployment nor a switch of the Vercel Production
Branch. Work from `astra/ticketchile-v2`. Real hosted staging was **not created** in M13:
the repository has no Vercel link and no explicitly identified staging account/resources.
An installed CLI is not authorization to select a team/project or reuse existing secrets.
Use [PROVIDER-CERTIFICATION](PROVIDER-CERTIFICATION.md) for actual evidence and pending cases.

## Environment contract

| Boundary | LOCAL | PREVIEW / STAGING | PRODUCTION |
|---|---|---|---|
| Application stage | `APP_ENVIRONMENT=development` | `APP_ENVIRONMENT=preview`; match `VERCEL_ENV` | `APP_ENVIRONMENT=production`; match `VERCEL_ENV` |
| Data | New synthetic loopback DB | New dedicated managed nonproduction DB/account/project | Separately approved live DB; never connected by this rehearsal |
| Database name | `ticketchile_test_*`, `ticketchile_local_*`, inert `ticketchile_build` | `ticketchile_preview_*` or `ticketchile_staging_*` | No test/local/preview/staging name |
| Origin | Loopback or reserved `.test`/`.invalid` | Exact HTTPS `STAGING_ORIGIN`; same APP_BASE_URL/NEXTAUTH_URL; preview/staging label or Vercel host | Approved HTTPS live origin, no preview/test hostname |
| Payments | Test/integration only | Stripe test / Webpay integration / Flow sandbox only | Live modes only; separately approved |
| Media | Local fixture store | Dedicated private preview bucket/key/prefix | Separate production bucket/key/prefix |
| Mail/AI/Wallet | Injected TEST transports/generated keys or explicitly labeled development account | Dedicated accounts/keys labeled `*_RESOURCE_ENVIRONMENT=preview` | Separate accounts/keys labeled production |
| Jobs and logs | Disposable loopback services/logs | Dedicated private runtime, scheduler and log sink | Separate runtime/scheduler/sink; never installed here |

`NODE_ENV=production` identifies a compiled Next runtime, not whether it is Preview.
The explicit application stage controls infrastructure isolation. A compiled local
rehearsal may set development, but its DB remains restricted to synthetic loopback names.
The inert build script cannot connect to a usable database. Local media still refuses
NODE_ENV production; use the dev preview for local media QA.

Hosted database setup also requires `DATABASE_RESOURCE_ENVIRONMENT` matching stage,
`DATABASE_EXPECTED_HOST` (hostname plus explicit port if present in URI),
`DATABASE_EXPECTED_NAME`, `DATABASE_SSL=true`, and certificate verification. Every
configured connection alias must be identical on hosted deployments; remove stale
integration aliases. The runtime checks the selected connection before constructing
the pool. URL query options that could override host/database are denied. Do not use
`sslmode=no-verify`, insecure certificates, production branches or production restore data.

These are fail-closed configuration checks, not proof of resource ownership. Opaque
keys cannot reveal their provider account. An operator must independently verify the
dedicated project, account, IAM and endpoint. Never copy a payment DB between environments
or change its provider mode: provider evidence has no cross-environment adoption workflow.
Separate DBs, origins, merchant credentials and mode checks are the boundary. Existing
callback verification still enforces provider reference, merchant API credentials, order,
amount, currency and idempotency; create flags do not bypass any authorization.

## Provisioning checklist and secret ownership

1. Infrastructure owner identifies the authorized Vercel team/project and a dedicated
   nonproduction database project/instance. Do not infer this from a global CLI login.
2. Create an empty `ticketchile_preview_certification` database. Separate migration role
   from runtime role; use a dedicated connection endpoint with TLS. Restrict runtime
   grants and audit-table mutation. Review function/trigger ownership and grants against
   the actual catalog; local owner-role tests do not certify least-privilege deployment.
3. Security owner generates independent random session, QR and encryption keys. Keep
   a recoverable protected encryption-key version with backups. Never reuse fixture keys.
4. Configure only Preview-scoped values from `.env.example`; no server secret may use
   NEXT_PUBLIC. Set unsupported/unverified providers disabled. Store values in the account
   secret manager, not source, command-line arguments or QA artifacts.
5. Finance/provider owner supplies dedicated test merchants. Messaging owner supplies
   test sender and exact controlled recipient list. Product/privacy owner approves AI
   project/model/minimized data and small spend allowance. Storage owner supplies the
   preview bucket and prefix-restricted credentials. Wallet owner supplies demo issuer.
6. Worker owner provisions a private Node runtime with the same Preview DB/configuration
   and retained encryption keys. Operations owner selects log sink, alerts and on-call.

New server settings: `STAGING_ORIGIN`, database resource/expected endpoint/name,
`STAGING_MIGRATION_DATABASE_URL`, `AI_RESOURCE_ENVIRONMENT`, `MAIL_RESOURCE_ENVIRONMENT`,
`MAIL_ALLOWED_RECIPIENTS`, `WALLET_RESOURCE_ENVIRONMENT`, `MEDIA_UPLOADS_ENABLED`,
`TRANSFERS_ENABLED`, `PROMOTIONS_ENABLED`, `MAIL_MAX_ATTEMPTS`. Resource labels are operator attestations;
they are not secrets or authorization grants. Review all environment scopes in Vercel
before a deployment. Never import a Production environment file into Preview.

## Migrate and seed

From `apps/web`, on the authorized nonproduction operator host, with Preview origin,
TLS binding and `STAGING_MIGRATION_DATABASE_URL` already injected securely:

```powershell
node scripts/staging-migrate.mjs --apply
```

This new executor accepts explicit Preview only. It uses the same immutable checksums,
advisory lock, transaction and existing-schema refusal as the local runner. It never
loads `.env`, chooses an application credential fallback, drops a DB or accepts production.
It is prepared and boundary-tested; **not executed against a remote server**.

Apply 0001–0011 once in order; rerun verifies checksums. No M13 schema migration was
needed. For a reconstructed legacy fixture, apply only 0001, insert synthetic legacy
orders/PAID payments, then apply 0002–0011. Tests prove owners survive, credential-zero
history is created, legacy PAID stays unverified, and unknown historical commissions
remain absent. Populated M11 media retains base64/local references through 0011.

An actual unledgered installation is different: obtain an authorized schema-only catalog,
compare every type/default/constraint/index/trigger, resolve duplicate/orphan ownership,
write a reviewed additive reconciliation, rehearse it on synthetic representative data,
then explicitly approve baseline checksum adoption. Do not stamp 0001 just to bypass
the refusal. Do not copy live customer data into staging. [MIGRATION-PLAN](MIGRATION-PLAN.md)
lists every historical adoption boundary.

For hosted seed data, use the actual registration/verification/admin review UI with
controlled inboxes, synthetic buyer/owner/door/admin identities and a future synthetic
event. Provision the initial privileged operator through a reviewed private procedure,
then enroll MFA. There is no public bootstrap. Local `bootstrap-local.mjs` intentionally
does not accept remote URLs; do not remove that guard for staging. Hosted initial-role
provisioning/grants remain an operator prerequisite. Local deterministic fixture examples
are in the M13 rehearsal scripts and tests, never public seed endpoints.

## Preview deployment preparation — not executed

First confirm the existing project's root/build settings and Preview-only configuration.
Use its authorized project name/team; retain its Production Branch and domain settings.
Vercel distinguishes [Preview and Production](https://vercel.com/docs/deployments/environments).
The following are the intended CLI operations after that account setup, from the repo root:

```powershell
git branch --show-current
vercel link --project <authorized-existing-project> --scope <authorized-team>
vercel env ls preview
vercel deploy --target=preview --scope <authorized-team>
```

Use an explicitly configured Preview alias or the returned Preview deployment host for
`STAGING_ORIGIN`, APP_BASE_URL and NEXTAUTH_URL. Redeploy Preview after binding that host
and configuring callback URLs. Never use `--prod`, promote, change Production Branch,
attach `ticketchile.com`, merge main or edit production DNS. See
[Vercel deploy](https://vercel.com/docs/cli/deploy). These commands are preparation,
not evidence that an authorized project currently exists.

Preview protection can block provider callbacks. Configure a narrowly reviewed staging
callback access method supported by that account; do not add a public auth bypass to
the application or expose a deployment-protection secret in browser URLs. Verify from
the provider's delivery console that requests reach the intended handler. A GET health
probe is not proof that provider POST callbacks pass ingress.

## Local executable rehearsal

Run from `apps/web`; PostgreSQL binaries, installed locked dependencies and Chrome are
required. The scripts create new synthetic loopback DBs and retain them for inspection.

```powershell
node scripts/local-db.mjs start
node --test --experimental-test-isolation=none --test-reporter=spec tests/*.test.mjs
node scripts/m13-restore-rehearsal.mjs
node scripts/m13-load-rehearsal.mjs
node scripts/m13-rollback-rehearsal.mjs
node node_modules/typescript/bin/tsc --noEmit --incremental false
node scripts/lint-all.mjs
node scripts/verify-build.mjs
git -C ../.. diff --check
```

Browser fixture runners: `m10-preview.mjs` + `m10-browser-qa.mjs` for cross-role workflows;
M11 pair for transfer/Wallet; M12 pair for media. One preview at a time on loopback 3005,
isolated headless Chrome debugging on loopback 9335. Set `QA_REHEARSAL=m13` and
`QA_ARTIFACT_ROOT=../../docs/03-implementation/qa/m13/<flow>` to retain focused 390/1440
evidence without overwriting prior milestone artifacts. Generated auth material stays
under ignored `.local`. Never run those fixture programs on a hosted or customer DB.

## Backup, restore and reset

M13 actually performed local custom-format `pg_dump`, fresh DB creation, `pg_restore
--exit-on-error`, all-table count/hash comparison, migration checksum verification and
application reads. Encryption keys and object bytes were retained separately. See the
structured restore report in [qa/m13](qa/m13/README.md).

For the **dedicated managed staging provider**, use its named instance/branch in the
console to create an encrypted backup/snapshot and a new isolated restore target. If
the chosen provider is Neon, restore/create only a branch of the dedicated staging
project; never branch a production project. If using managed RDS/PostgreSQL, restore
the staging snapshot/PITR to a new staging instance with isolated security groups.
Provider selection/account permissions are unknown: record the actual provider-specific
snapshot ID, retention, restore point/time, KMS/role requirements, endpoints and operator
commands before execution. No hosted PITR, RTO/RPO or production backup certification
is claimed from the local dump.

For a logical staging backup on an approved operator host, provision a secure pgpass/
service file (not committed) for the dedicated source and a separately created empty
target; use explicit service names, never inherited PGDATABASE/PGHOST:

```powershell
pg_dump --dbname=service=ticketchile_preview_source --format=custom --no-owner --no-acl --file=preview.dump
pg_restore --dbname=service=ticketchile_preview_restore --exit-on-error --no-owner --no-acl preview.dump
```

Before either command, independently verify service host/database/TLS against the
resource binding. Stop staging writers for a coordinated evidence snapshot; retain
object-store versions and encryption keys at compatible restore points. Compare ledger,
constraints, every table count, critical owners/orders/payments/history/commission/media/
AI/operations and application reads. Don't copy provider credentials or raw data into logs.

Reset strategy is replacement: create a new staging-only empty DB and new isolated
fixture namespace, migrate, reseed, then rebind only Preview and its private workers.
Record the old synthetic resource as retained for review. No generic destructive reset
CLI was added. Delete retired synthetic resources only through a reviewed account-specific
procedure after checking their exact identifiers and retention; never calculate a production
target from an environment fallback. Local cluster stop retains all fixture data.

## Workers, scheduling and visibility

`runWorkerBatch(job,limit)` in `src/lib/workers.server.ts` is a private Node entry point.
It rejects unknown jobs/unbounded batches, uses per-job session advisory locks, reports
overlap, releases locks after failures, and destroys connections when unlock fails.
Use at least two pool connections; domain work needs connections while the scheduler
lock is held. Domain transaction locks, mail fencing and provider dedupe remain required.
No HTTP cron endpoint, standalone packaged worker deployment or installed scheduler exists.
The host must bundle server imports and invoke this entry under a restricted runtime;
don't ship the test VM loader as a production worker.

| Job | Proposed scheduling | Bounds/retry/authority |
|---|---|---|
| Mail | Scheduled batch every minute, then tune from measured backlog | 25 default/100 max; SKIP LOCKED, two-minute row leases/fencing; one-minute retry; attempt cap (default 10, configurable 1-20) or uncertainty >23h REVIEW; expiry/owner/generation rechecked |
| Payment recovery + hold expiry | One scheduled batch/minute/environment | 50 domain default, wrapper 25/100 max; per-job lock; inventory transaction lock; authenticated provider status; oldest attempts rotate; no invented paid state |
| Media cleanup | Scheduled batch every 15 minutes, one environment | 25/100 max; persisted tombstones and reference locks; ten-minute failed-delete backoff; configured technical orphan grace |
| Legacy media adoption | Manual bounded operation only | dry run first, 10/50 max, checkpoint/retry with hashes; retained originals/conflict journal; stop on unexpected drift |
| AI ciphertext/metadata deletion | Not installed | Access expiry exists; physical cleanup requires approved retention/legal holds |
| Settlement/payout | Authorized manual workflow only | No scheduled payout or banking action; accounting review and external evidence required |

No continuous polling process is required by these initial schedules. Account quotas,
timeouts and provider budgets determine final cadence. Local regression covers concurrent
workers, lost response, crash lease expiry, retries, dedupe-window REVIEW, poison payload
failure, media failure/retry and global lock release. Scheduler crash releases its DB
session lock; mail row leases remain recoverable. Observe ages/counts, not only process exit.

Read-only visibility queries for a restricted operations role:

```sql
SELECT state,count(*),min(created_at),max(attempts) FROM mail_jobs GROUP BY state;
SELECT count(*) FROM mail_jobs WHERE state='SENDING' AND lease_until<now();
SELECT status,fulfillment_status,creation_state,count(*),min(updated_at)
  FROM payments GROUP BY status,fulfillment_status,creation_state;
SELECT state,count(*),max(attempts),min(touched_at) FROM media_objects GROUP BY state;
SELECT state,outcome,count(*) FROM ai_requests GROUP BY state,outcome;
```

Send closed-schema JSON console events and restricted audit aggregates to the chosen
single staging log sink. Logs carry generated correlation ID, action/category/severity
and duration; no raw Error/URL/header/body/provider payload is serialized. AI retains
its request correlation/feature/provider/model/outcome/latency without full prompts.
Payment exceptions and check-in decisions have immutable domain audit evidence; unexpected
scanner/media HTTP errors carry sanitized categories and response request IDs. Configure
alerts for readiness failure, queue age, expired leases, REVIEW/UNKNOWN, repeated storage
failures and AI provider errors. Named owner, thresholds and sink retention remain external
operational decisions; no vendor or alert delivery was fabricated.

## Health, HTTPS and failure acceptance

Probe `S/api/health` and `S/api/ready`: only generic alive/ready booleans, no-store and no
secrets/stack. Readiness checks core config and eleven-version ledger, not providers.
In dedicated staging deny DB connectivity temporarily and expect readiness 503; restore
it and recover. Local tests exercise this failure; actual hosted probes remain pending.

On actual HTTPS inspect Secure/HttpOnly/host-only/SameSite=Lax cookies, login/logout,
MFA/recovery, transfer fragment handoff and rejection of foreign origins. Verify Webpay
cross-site return can verify provider evidence without trusting a buyer cookie, and owner
login remains necessary for ticket access. Verify CSP allows only required image origin,
hosted payment form destinations, self camera and Wallet navigation; AI is server-to-server.
No global CSP wildcard is acceptable. Local HTTP/localhost Secure-cookie behavior is
**not** HTTPS ingress evidence. Repeat on physical devices before claiming certification.

Failure matrix: DB offline -> generic unavailable; mail failure -> committed purchase/
transfer intact; AI failure -> draft retained/manual editing; media failure -> prior image
retained/retry; duplicate/late callbacks -> one issuance or REVIEW; worker crash -> lease
recovery; scanner network loss -> no offline admission. Local suite/browser evidence and
pending hosted cases are separated in the QA report.

## Operational disable and recovery

- AI: `AI_PROVIDER=disabled`; preserve editable drafts/proposals.
- Each payment: its `*_ENABLED=false`; refunds separately `STRIPE_REFUNDS_ENABLED=false`.
  Existing evidence/callback verification continues under matching retained credentials.
- Transfers: `TRANSFERS_ENABLED=false` blocks initiation/acceptance; cancellation/history
  remain; no credential generation is reset. Event policies continue to apply on reenable.
- Promotions: `PROMOTIONS_ENABLED=false` blocks new quotes/reservations; existing immutable
  discounted reservations and payment finalization keep their historical terms.
- Media: `MEDIA_UPLOADS_ENABLED=false` blocks writes/adoption but preserves reads. Stop
  cleanup/adoption scheduling separately. Full provider disable also removes reads.
- Mail: `MAIL_TRANSPORT=disabled` leaves queued jobs; never label them delivered.

Flags are operational gates, never authorization. Rolling environment changes affect new
processes after restart/redeploy; drain/stop old writers to complete an incident freeze.
An already executing call may finish. Do not promise instantaneous cancellation of I/O.

App rollback: preserve the current schema, encrypted data, objects and pending provider
bindings. Restore the last **compatible** artifact/config; never down-migrate blindly.
M13 locally restored/rebuilt M12 and verified reads against the restored 0011 DB. The
rehearsal uses original Turbopack mode with only a local dependency-root packaging override.
It does not prove a hosted routing switch. M12 lacks the new M13 isolation/mail/write
switches: if rolling back M13, keep external providers/workers disabled and reinstate
equivalent operational isolation before any traffic. Never restore a pre-M11 scanner
after transfers. Full rollback triggers and future release order: [PRODUCTION-CUTOVER](PRODUCTION-CUTOVER.md).

## Retention inventory — decisions still required

| Data | Technical behavior | Pending decision |
|---|---|---|
| AI proposals/simulator | Seven-day access expiry; claimed draft cleared | Physical encrypted-data deletion, legal holds and metadata policy |
| Mail/outbox | Encrypted snapshots, delivery/expiry/REVIEW history retained | Body/recipient retention, deletion and bounce/complaint policy |
| Media | Grace-delayed unreferenced cleanup; event/adoption pins retained | Original/journal/object-version/closed-event retention |
| Audit/admin/support notes | Immutable history/private notes retained | Legal retention, controlled archival/redaction/access requests |
| Payments/refunds/settlements | Immutable evidence and accounting snapshots retained | Financial retention, external evidence archival, legal holds |
| Transfer claims/messages/history | Expiry/revocation limits access; owner history retained | Physical claim/message deletion and nominative policy |

No legal duration or mass deletion job was invented. Technical expiry is not deletion.
