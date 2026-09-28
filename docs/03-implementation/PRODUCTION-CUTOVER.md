# Future production cutover plan — not execution authorization

M13 did not deploy, merge main, change Vercel Production Branch, attach a domain, alter
DNS or touch production credentials/customer data. Production remains **BLOCKED**.
Use [RELEASE-READINESS](RELEASE-READINESS.md) and [PROVIDER-CERTIFICATION](PROVIDER-CERTIFICATION.md)
to close gates before requesting a separately authorized release.

## Owners and prerequisites

Name release, rollback, database, security, payments, email, storage, operations and
business decision owners. Approve a reviewed commit/lockfile/configuration version;
repeat full tests/TypeScript/whole lint/build and dependency/security review in the chosen
builder. Real sandbox, HTTPS, physical devices, least-privilege grants, alerts and worker
installation must be evidenced. Optional unverified AI/Wallet/payment methods stay disabled.

Business sign-off must explicitly cover commission base/rate/rounding/fixed fee, fee payer
and tax disclosure, refund eligibility/window/partial/used-ticket handling and commission
treatment, settlement cadence/reserves/external payout evidence, transfer limits/fees,
nominative/age rules, retention/legal holds, organizer verification, legal company identity
and approved Spanish terms/privacy/refund text. No milestone substitutes an invented default.

## Ordered cutover checklist

1. **Backup and recovery point.** Verify managed-provider backup/PITR and a fresh-target
   restore with application reads, key recovery and object versions. Record encrypted
   backup identifiers, restore duration and agreed RPO/RTO. A local dump is insufficient.
2. **Maintenance and writer coordination.** Identify active holds, pending provider
   sessions, uncertain refunds and worker leases. Plan a checkout/write freeze and user
   communication if catalog reconciliation or backfills need locks. Drain incompatible
   workers/scanners; keep authenticated callback capture/reconciliation accounted for.
3. **Actual schema adoption.** Compare the authorized production catalog to reconstructed
   0001; resolve drift/orphans/duplicates without inventing ownership or financial history.
   Review any reconciliation migration and baseline marker separately. Apply immutable
   0001–0011 through the approved production executor/role; the staging runner refuses
   production. Verify checksums, constraints, indexes, defaults, grants and row counts.
4. **Application release.** Deploy the approved compatible artifact with production-only
   DB/origin/secret bindings. Keep unapproved features disabled. No automatic migration
   on web requests/startup. Do not expose diagnostic secrets in health or client variables.
5. **Workers.** Install separately reviewed private scheduler/runtime; test locks, leases,
   bounded calls, retries, oldest-job visibility and alert delivery. Start mail and payment
   recovery deliberately, then media cleanup after reference integrity is confirmed.
   AI deletion and settlements are not automatic jobs.
6. **Provider callbacks.** Configure each approved live merchant's separate webhook/return
   URLs and secrets under its account owner. Never reuse sandbox DB/credentials. Verify
   signature/account/reference/order/amount/currency, dedupe and delayed callback recovery.
   Enable one provider at a time only after its production requirements are satisfied.
7. **Media.** Verify private production bucket/prefix/IAM/TLS/CSP/checksum/signing behavior,
   backup/version policy and host processing limits. Rehearse bounded legacy adoption,
   checkpoints and conflict recovery; retain originals and current images. No bulk deletion.
8. **Smoke checks.** Liveness/readiness; public published catalog; current-owner QR/Wallet
   if enabled; foreign ticket/tenant/event denial; organizer grants; assigned door scanner;
   admin MFA/refund/settlement authority. Any production smoke transaction/data creation
   needs explicit separate approval. Do not silently charge money for a health check.
9. **Controlled traffic and monitoring.** Watch errors/readiness, DB pool/locks, latency,
   payment UNKNOWN/REVIEW, fulfillment lag, mail backlog/expired leases, AI cost/errors,
   media failures and scanner conflicts. Compare accounting/inventory invariants; name
   the person who can stop rollout. Record artifact/config/checksums and actual evidence.
10. **Post-release review.** Verify new sessions/recovery and callback delivery, reconcile
    every test/uncertain operation, confirm scheduled jobs and alerts over the agreed
    observation period. Retain old compatible artifact/backups under approved retention.

## Rollback triggers and limits

Stop rollout on cross-tenant/owner access, environment mismatch, duplicate financial
effects, oversell, revoked QR acceptance, inconsistent migration, missing audit, data
loss, sustained readiness failure or agreed operational thresholds. Disable affected
new operations, preserve evidence, and engage the named owner. Threshold numbers and
on-call policy require explicit operational approval; none is invented here.

Prefer a compatible application rollback or forward repair. Restore the previous artifact
and its reviewed environment without reversing schema or erasing audit/payment/ownership
history. Reevaluate every worker/scanner version and queued encrypted payload. Restore a
DB only through the approved recovery plan with explicit reconciliation of provider money
movement and object versions since the recovery point; an app rollback cannot undo money.

M13 demonstrated a **local M12 artifact recovery against schema 0011**. It did not certify
production routing, DNS, managed restore, live callbacks or rollback under production load.
M12 lacks M13 isolation/recipient/write guards: disable external providers and workers if
using that emergency artifact until equivalent controls are restored. Pre-transfer scanners
must never return after credential generations advance. Signed/cached/downloaded media
and saved Wallet objects cannot be remotely recalled by rolling back code.

Keep explicit incident controls for each payment/refund adapter, AI, transfer acceptance,
new promotions, mail and media writes. Keep existing payment evidence and valid callback
verification recoverable. Reenable only after retesting the failed boundary on isolated
staging and obtaining the separately required release decision.
