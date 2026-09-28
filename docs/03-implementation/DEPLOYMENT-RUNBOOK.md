# Deployment runbook — authorization required

This is a future operator procedure. M10 performs no deployment. Use a reviewed release artifact and explicit environment authorization; never point the local rehearsal scripts at production.

## Before a release

1. Review [release blockers](RELEASE-READINESS.md), provider/business matrices and [environment contract](ENVIRONMENT.md). Name a release owner and rollback decision owner. Record approved enabled features/providers.
2. Pin the reviewed commit and package lockfile. Install from the lockfile in a clean builder, scan dependencies, run full tests, TypeScript, scoped and whole-repository lint, then build. Do not deploy the synthetic verification build environment as configuration.
3. Restore an encrypted database backup to an isolated staging database. Reconcile catalog/constraints/indexes/owners with the baseline and migration ledger. Check SHA-256 of normalized migration text. Rehearse 0001–0009 in order; never change an applied file or silently adopt an unledgered schema. Existing schema requires reviewed reconciliation, not running baseline DDL blindly.
4. Record backup location, restore result, recovery point/time and access control. Check available storage, connection capacity, migration locks and a maintenance window. Have the previous compatible app artifact available.
5. Supply environment secrets through the secret manager; verify HTTPS origins, certificate verification, trusted IP handling, complete provider pairs and disabled unsupported features. Install media storage and worker runtime. Use a least-privilege application database role; keep migration authority separate.

## Worker installation and rehearsal

Workers are trusted internal server calls, **not public cron endpoints**. No installed scheduler or standalone production worker binary is claimed by the repository. Package these services in the chosen trusted Node runtime, resolve the app's server imports, and review its invocation identity before launch.

| Job | Existing service | Suggested initial scheduling / safeguards |
|---|---|---|
| Pending payment recovery + hold expiry | `reconcilePendingPayments(50)` | Once per minute initially; at most one reconciliation runner per environment. Bounded to 100. Retrieves authenticated provider evidence, never invents payment. Alert on repeated failure, REVIEW and oldest pending age. Tune with measured provider limits. |
| Transactional/security mail | `processMailJobs({limit:25})` | Once per minute initially; DB row leases and fencing protect overlap. Max 100, two-minute leases, stable provider idempotency key. Retry backoff; uncertainty older than the supported dedupe window requires REVIEW. Do not reset state or keys to force resend. |
| AI/privacy maintenance | No installed deletion job | Expired proposals cannot be read/applied; physical ciphertext cleanup and broader retention schedules need an approved legal-hold policy and implementation. Do not equate access expiry with deletion. |
| Settlement | Explicit administrator workflow | Never schedule automatic payout or mark payment sent. An authorized operator records actual external payout evidence after accounting review. |

Local `tests/payments.integration.test.mjs` rehearses expiry, reconciliation without a browser/webhook, failed mail, crash/lease recovery, expired security messages and overlapping workers with TEST transports. Finance tests rehearse uncertain refunds and external payout records. No real payment, mail or AI provider is called. Staging must repeat with certified sandbox providers and operational alerts.

## Release and smoke checks

1. With separate approval, apply the reviewed migration plan using the approved production executor, verify the ledger/checksums and expected constraints, then start a compatible app artifact. Do not run down migrations for an app rollback.
2. Probe `/api/health` for liveness and `/api/ready` for core readiness. Both responses must be no-store, generic and free of dependency/credential details. Readiness alone is not a release decision.
3. Verify headers over HTTPS: CSP, DENY framing, nosniff, referrer policy, self camera permission and HSTS. CSP permits inline hydration/styles; it is not a nonce-based strict CSP. Test camera, hosted checkout redirects, Webpay form return and Wallet with each enabled provider. No subdomain-wide HSTS/preload assumption is made.
4. Smoke test public discovery, a buyer's own ticket/QR, foreign-ID denial, organizer-owned event, assigned/unassigned scanner, admin MFA and least privilege. Use dedicated non-production accounts and sandbox purchases in staging; production smoke data requires separate explicit authorization.
5. Verify email queued/delivered evidence, reconciliation progress, expiry inventory release, audit events and sanitized operational logs. Confirm request correlation on generic failures and alert routing without personal data.
6. Enable traffic/features gradually only under the approved release plan. Watch error rate, pool saturation, pending age, invalid evidence, check-in conflicts, mail REVIEW and refund UNKNOWN. Stop promotion if a critical boundary fails.

## Post-release

Record artifact, migration checksums, configuration version (no values), enabled providers, smoke evidence and rollback point. Keep the previous compatible artifact and backups through the approved retention window. Review the incident procedures before closing the release. Legal retention durations, service SLOs, alert thresholds and on-call contacts must be filled by their owners before launch.
