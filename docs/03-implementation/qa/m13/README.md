# M13 evidence — 2026-09-28

Synthetic, isolated local execution on branch `astra/ticketchile-v2`, starting at M12
`7f34bf0aa3c2e1af6ec9447ee15315a42b24e46d`. M13's final commit contains this evidence.
No hosted Preview, external provider call, real delivery, financial transaction,
production credential/data access, production deployment, merge or DNS change occurred.

## Executed gates

| Gate | Result |
|---|---|
| Full Node suite with test isolation disabled | **401 passed**, zero failed/skipped; PostgreSQL integration/concurrency and provider contracts included |
| TypeScript `tsc --noEmit --incremental false` | PASS |
| Scoped lint | PASS: **44** changed/new JS/TS files, no errors/warnings |
| Whole repository lint | PASS: **373** maintained JS/TS files including API/shared types, no errors/warnings |
| Production build `scripts/verify-build.mjs` | PASS, scrubbed inert configuration; final build ID in failure report |
| Migrations | PASS: fresh/reconstructed legacy/populated M11 through 0011; checksum/idempotency/drift/rollback; no applied SQL edited |
| Real local dump/restore/application reads | PASS: **58** table snapshots equal, **73** validated foreign keys; 164,701-byte custom backup, 676ms local restore in this fixture |
| Prior application restore | PASS: M12 artifact rebuilt/started against restored 0011 schema; catalog read, anonymous QR denial and unchanged ledger |
| Actual compiled dependency failure | PASS: liveness 200, unavailable-loopback-DB readiness 503 with only `{ready:false}` and no-store |
| Cross-role browser workflow | PASS: **104** states at 390/1440 |
| Transfer browser workflow | PASS: **46** states at 390/1440 |
| Media browser workflow | PASS: **38** states at 390/1440 |
| Bounded local load | PASS: catalog, hold/checkout preparation, finalization, check-in, attendee/admin reads and overlapping queue batches |
| Repository heuristic secret scan | No long live Stripe keys or embedded private key blocks in 452 tracked/new text files at scan time; not a comprehensive secret/security certification |
| Root `git diff --check` | PASS |

Full command recipes are in [STAGING-RUNBOOK](../../STAGING-RUNBOOK.md). Ignored detailed
logs are `apps/web/.local/m13-*.log`; no credentials or raw provider payloads are committed.
Fixture databases and ignored rollback directories are retained; web servers and the
dedicated browser are stopped after verification. The loopback PostgreSQL cluster remains
available for inspection. No system service or production worker was installed.

## Browser evidence and limits

Chrome headless desktop/mobile viewport emulation, 1000px viewport height, device scale
1; 390 and 1440 widths. Exact browser version and artifact metadata are in `manifest.json`.
These are M13 candidate app runs on the M12 baseline plus this commit's browser-affecting
changes. Subsequent changes bound malformed-mail retries, sanitize worker connection
failures and enforce minimum hosted secret length; browser UI and ownership/session
flows remain unchanged. The final
production build was separately verified. No physical phone, actual HTTPS ingress,
Google issuer, hosted merchant UI or screen-reader certification is implied.

| Flow | Actual browser coverage | Additional real-DB/contract coverage |
|---|---|---|
| Buyer | Discovery/detail/quantity, login, confirmation/My Tickets/QR, signup/verification, transfer handoff/accept/cancel/resend and former-owner denial | Hold/verified fixture evidence/concurrent issuance via isolated services; mail retry/poison review; real hosted payment and email delivery pending |
| Organizer | Password/TOTP login, create/edit/save/preview/review/publish, scoped staff invite, media upload/replacement, finance/attendee/promotion/courtesy screens | Registration/verification/grants, promotion limits, courtesy issuance/revoke, staff reassignment, tenant denial and accounting services; no real AI provider |
| Scanner | Assigned event, canvas QR decoder valid/duplicate/wrong-event/invalid, camera denied/absent and offline recovery, stats/history; foreign event denial | Old/new transfer generation, refunded/cancelled, manual-mode and race boundaries; no physical camera claim |
| Admin | Password/TOTP login, support form, moderation, refund review/disabled execution, synthetic refund evidence, settlement approval/external payout record and capability denial | Organizer verification, payment exceptions, refund/settlement concurrency and immutable audit; no money movement |
| Media | Actual local binary upload, private/admin preview, publication/read, replace/conflict/retry, remove and missing-image fallback | S3 command/signed-URL contracts, durable intent, deletion failure, retention references, bounded legacy adoption/checkpoint/replay/hash tests |

Files: `workflows/browser-report.json`, `transfers/browser-report.json`,
`media/browser-report.json`. Sixteen purposeful screenshots are separate from approved
design references. They show synthetic content only. Scanner and admin screenshots were
visually inspected alongside DOM geometry/labels and executable workflow assertions.

The older browser harness needed changing-frame canvas output, hydration readiness before
ticket selection, and an enabled-save/persisted-title wait instead of matching the initial
“Guardado” label. Final reruns passed; no application guard was weakened. The rollback
trial with an alternate webpack builder failed on the prior release's generated PageProps
constraint. The original Turbopack pipeline, with a workspace dependency-root packaging
override only, passed. This is a builder compatibility limitation, not a claim that every
build mode passes.

## Recovery, workers and measured load

`restore-report.json` records identical table hashes/counts after actual pg_restore,
retained transfer generation/current owner and payer, historical commission, decryptable
AI ciphertext and actual media bytes/checksums. Legacy originals remain in the private
adoption journal. `rollback-report.json` records the prior commit and rebuilt artifact.
`failure-report.json` records the actual final compiled process's DB outage response.
These do not certify managed backups/PITR, hosted traffic switching or production RTO/RPO.

Worker regressions include real PostgreSQL overlapping sessions, scheduler lock release,
mail crash/lease expiry, lost-response dedupe, malformed ciphertext reaching REVIEW
without provider calls, stale uncertainty, authorization expiry and media failure/retry.
`MAIL_MAX_ATTEMPTS` defaults to 10 (accepted range 1–20); failed jobs reach REVIEW at the
cap, including failures before a payload could be sent. Never reset attempts/keys blindly.
No scheduler/alert sink is installed; private runtime packaging and least-privilege grants
remain external work.

`load-report.json` uses a new disposable DB, at most five concurrent local operations,
20 synthetic purchases/check-ins and ten promotion reservations. Measured p95 was 89ms
catalog, 123ms hold/checkout preparation, 87ms fixture finalization, 58ms check-in,
25ms attendees, 6ms admin reads and 33ms overlapping queue batches. Ticket inventory and
promotion limits remained consistent. Used-ticket messages were cancelled before delivery.
This small warm/local sample is not a throughput or capacity certification.

## Explicitly pending

Every enabled real provider sandbox; Vercel project/team authorization; dedicated managed
DB/bucket/keys; callback reachability and HTTPS cookie/CSP tests; worker runtime/scheduler,
alerts and grants; sender/bounce/complaint readiness; actual model quality/privacy; Google
issuer and two-phone QR/Wallet; business/legal decisions; independent security,
accessibility/dependency/capacity review and production-specific schema/restore/cutover.
See [PROVIDER-CERTIFICATION](../../PROVIDER-CERTIFICATION.md) for exact cases and status,
and [RELEASE-READINESS](../../RELEASE-READINESS.md) for classified blockers.
