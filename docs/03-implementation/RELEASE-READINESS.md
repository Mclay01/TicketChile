# TicketChile release readiness - M13

**Release decision: BLOCKED for production.** M1-M12 are complete; M13 prepares isolated staging and records local operational evidence. Real provider, hosted HTTPS, physical-device and business/release approvals remain pending. No production deployment or data access occurred.

## M13 current release decision

**BLOCKED for production.** M1-M12 are complete and preserved. M13 adds isolated
staging preparation, environment/recipient/incident guards, private worker dispatch,
local fresh/legacy migration/restore/rollback/load and cross-role browser evidence.
No real Preview deployment, external provider call, production data/credential use,
DNS/domain/branch change, merge or production scheduling occurred.

The authoritative matrix is [PROVIDER-CERTIFICATION.md](PROVIDER-CERTIFICATION.md).
Executable setup is [STAGING-RUNBOOK.md](STAGING-RUNBOOK.md); future release plan is
[PRODUCTION-CUTOVER.md](PRODUCTION-CUTOVER.md). Local evidence: [qa/m13](qa/m13/README.md).
Historical milestone notes below are superseded where they describe missing M11/M12
implementation. Local passes do not imply hosted or production certification.

| Classification | Current finding |
|---|---|
| RESOLVED | Cross-environment runtime guards, nonproduction mail allowlist, media upload/transfer/promotion incident switches, private worker overlap guard; local migrations/restore/rollback/load and authorization regressions |
| STAGING VERIFIED | None against a hosted account; local rehearsals are explicitly recorded separately |
| EXTERNAL CERTIFICATION REQUIRED | Authorized Preview project/DB, every enabled real payment/mail/AI/S3/Wallet provider, reachable HTTPS callbacks, restricted grants, worker packaging/scheduling, observability/alerts and sender/bounce/complaint readiness |
| PHYSICAL DEVICE REQUIRED | Two-phone QR/camera/brightness/focus/network tests, transferred/refunded/duplicate/wrong-event QR and actual Wallet passes |
| BUSINESS DECISION REQUIRED | Commission/fee payer/refund/settlement/transfer/nominative/retention/organizer verification/legal identity and approved customer policies; AI model/privacy/budget if enabled |
| PRODUCTION REHEARSAL REQUIRED | Actual schema adoption, managed backup/PITR/object/key restore, compatible hosted rollback, production grants/ingress/security/dependency/accessibility/capacity and release/on-call sign-off |

Exact recommended M14: **External staging certification, physical-device acceptance,
and business-policy sign-off.** Obtain dedicated nonproduction account access, run the
pending provider/HTTPS/worker/device cases and record approved policies. This is a
recommendation only; M13 stops after its coherent commit. It does not authorize production.

## Historical M10 evidence and scope

See [QA-CHECKLIST](QA-CHECKLIST.md), [M10 audit](M10-AUDIT.md), [progress](ASTRA-PROGRESS.md) and `qa/m10/`. Baseline: branch `astra/ticketchile-v2`, clean `a3d38370b3b48598f1772148bc8d0f741f7221f1`, 328 tests, TypeScript/build/scoped lint pass; application lint 15 errors / 1 warning. Historical 287/35 is not the current lint result.

Local verification uses disposable loopback PostgreSQL, synthetic identities, isolated Chrome and injected provider transports. It is not proof of merchant approval, email deliverability, real camera behavior, production scale, assistive-technology certification or legal compliance.

## Historical provider implementation summary (current matrix linked above)

Production credential status is **not inspected** for every row. No provider is authorized for production enablement by this document.

| Provider | Implemented | Local evidence | Sandbox / certification | Default / release state |
|---|---|---|---|---|
| Stripe | Checkout, verified webhook/status reconciliation, full-order refund | SDK doubles, duplicate/uncertain outcome, amount/currency/owner checks, refund replay | Real merchant test and live account/webhook verification pending | Disabled without full config + explicit flags; release blocked |
| Webpay | Creation, commit/status recovery, authenticated evidence | Doubles, duplicate commit and cancellation boundaries | Transbank certification and deployed HTTPS return flow pending | Disabled without full config; release blocked |
| Flow | Creation, signed API evidence, authenticated kick | Doubles, token substitution and retries | Sandbox merchant round trip and production credentials pending | Disabled without full config; release blocked |
| Fintoc | Unavailable boundary only | No charge or hold through unavailable method | Adapter / merchant integration absent | Disabled; future feature |
| Manual transfer | Unavailable boundary only | No solicitation or unauthorized approval | Business approval/evidence workflow absent | Disabled; future feature |
| Resend | Durable encrypted mail queue, leases and idempotency | Injected TEST transport, retry/crash/expiry/ownership cases | Verified sender, deliverability, SPF/DKIM/DMARC and provider dedupe validation pending | Disabled without configuration; worker installation required |
| OpenAI | Allowlisted structured-output adapter, bounded proposals and explicit apply | Fake/development adapters, schema/privacy/rate/revision tests | Selected model, account budget, latency and output evaluation pending | Disabled by default; optional independently gated feature |
| Media storage | M12 local/S3 adapter, variants and lifecycle | Authorization, commands, failure/adoption/cleanup tests | Dedicated S3 provider/IAM/delivery certification pending | Missing configuration fails closed; no production enablement |
| Google Wallet | Current-owner ticket lookup and signed pass | Authorization and configuration tests | Issuer/service-account approval and Android/device testing pending | Optional; unavailable without complete configuration |

## Feature readiness

| Feature | Local status | Remaining gate |
|---|---|---|
| Discovery, account, owned tickets/QR | Implemented and regression covered | Real content, privacy copy, browser/device acceptance |
| Identity, MFA, roles, event scopes | Implemented, persisted sessions and revocation | HTTPS ingress, secrets, recovery delivery, penetration review |
| Holds, payment evidence, fulfillment | Transactional and concurrency tested | Merchant certification, reconciliation scheduler, approved fee policy |
| Organizer Event Center / media | Editor, preview, transitions, scoped operations and M12 S3-compatible adapter implemented | Production credentials, storage/IAM/delivery validation, organizer verification policy |
| Scanner | Server authorized, atomic check-in, event-scoped statistics | Real iOS/Android camera and venue-network test; no offline admission |
| Admin finance/support | Explicit capabilities, confirmations, audit/idempotency | Financial/legal policy, accounting reconciliation, provider refund enablement |
| AI | Optional, bounded proposals with human apply | Provider evaluation and privacy acceptance; manual editing works without AI |
| Workers / operations | Internal bounded services rehearsed locally | Scheduler, monitoring, alert routing, retention jobs, backup/restore drill |

## Business decisions (not implementation defaults)

| Decision | Owner | Gate |
|---|---|---|
| Buyer fees, tax presentation, processor costs | Commercial + accounting | Approve exact checkout disclosure; current code only supports explicitly approved zero buyer fee |
| Organizer commission versions and refund treatment | Finance | Approve basis/fixed amounts, effective dates and accounting rules; never backfill unknown history |
| Refund eligibility, partial refunds, used tickets, cancellations | Legal + support + finance | Publish policy; enable only supported full-order flows after review |
| Settlement timing, reserves, payout evidence and dispute handling | Finance | Approve policy; platform records external payouts, does not initiate transfers |
| Organizer verification and publication/moderation | Operations + legal | Define evidence and escalation; approval remains explicit |
| Terms, privacy, consumer disclosures and contact identity | Legal + business | Replace clearly pending legal content with approved Spanish documents |
| Retention/deletion, access requests and legal holds | Privacy + legal + security | Approve periods and execution/audit procedure; do not invent statutory retention durations |
| AI model, budget and data processing acceptance | Product + privacy | Approve provider and minimized context; optional feature can remain disabled |

## Hard release gates

- Reconcile the actual schema with the reconstructed baseline; review drift, ownership gaps and legacy paid rows. Backup and restore evidence, immutable ledger checksums and reviewed migration executor required. The local migration runner deliberately cannot deploy remotely.
- Provision and certify the implemented M12 media adapter: separate private preview/production buckets and credentials, conditional puts/checksums, authorized delivery, version retention/backups, origin configuration and scheduled cleanup. No live validation is claimed.
- Configure approved secrets and trusted HTTPS ingress; verify host-only cookies, session revocation, MFA recovery, TLS certificates, CSRF origin behavior, rate limiting and sanitized proxy headers.
- Complete each enabled merchant's sandbox/certification and deployed webhook replay/return/refund tests. Keep all other methods disabled.
- Install reconciliation/expiry and mail workers, alerts, retries, backlog dashboards and an on-call owner. No “email sent” promise before provider delivery evidence.
- Sign off policy/legal content and accounting rules above. Confirm physical privacy cleanup and legal-hold behavior.
- Run staging browser/accessibility/real-device QA, security review and a restore/rollback rehearsal; measure representative production-like load separately from the small local query fixture.
- Review current dependency advisories with approved network tooling before release. No dependency version upgrade or vulnerability-free claim was made during M10.

M10 is not permission to launch. Use [DEPLOYMENT-RUNBOOK](DEPLOYMENT-RUNBOOK.md) and [INCIDENT-ROLLBACK](INCIDENT-ROLLBACK.md) only after separately authorized release gates are satisfied.


## M11 product extension (2026-09-28)

The user extended the completed M1-M10 plan with M11 buyer profile editing and secure ticket transfer. Technical implementation adds durable recipient-bound claims, ownership history, atomic acceptance and QR/Wallet credential revocation; see [TICKET-TRANSFER.md](TICKET-TRANSFER.md) and [qa/m11](qa/m11/README.md). This supersedes the earlier transfer/rotation feature gap, not the release BLOCKED decision.

Additional release gates: reviewed adoption of migration 0010; every scanner/alias/mail worker upgraded before enabling transfers; approved event/tier transfer policies (none enabled by migration); email link fragment preservation and delivery proof; actual Wallet issuer/device acceptance; ownership/ciphertext retention and privacy review; production-like concurrency/load and security testing. Email change, transfer charging, nominative/age verification, remote Wallet removal and a dedicated policy editor remain unavailable.

Recommended next milestone, not started: **M12 - production media storage and asset lifecycle**. Implement the currently missing production MediaStore adapter, tenant-scoped upload/read validation, safe legacy-media adoption and orphan/retention operations, with disposable/provider-sandbox tests and operational documentation. Production deployment and unresolved commercial/legal approvals remain separately gated.

## M12 media implementation (supersedes the preceding recommendation)

The production adapter is now **IMPLEMENTED** and **LOCAL/CONTRACT TESTED**.
**PRODUCTION CREDENTIALS REQUIRED** and **PRODUCTION VALIDATION REQUIRED**.
Release remains **BLOCKED**. One S3-compatible adapter, retained local development
storage, authorized private/public/admin delivery, immutable variants, durable upload
recovery, safe replacement, bounded cleanup and dry-run/checkpoint legacy adoption
are implemented. See [MEDIA-ARCHITECTURE.md](MEDIA-ARCHITECTURE.md) and [qa/m12](qa/m12/README.md).

Remaining media gates: dedicated private preview and production buckets/credentials;
provider conditional-write/checksum/HEAD/signed-GET/delete compatibility; IAM/public
access denial, CSP origin at build/runtime, encryption/backups/version retention;
production catalog/0011 and restore rehearsal; private worker installation/alerts;
sanitized legacy migration rehearsal and approval before any real adoption; physical
device, hosting-memory/load and external delivery validation. M12 created no remote
resources, used no production credentials and performed no deployment/data migration.

Limitations: signed reads/public caches may survive unpublication for about a minute;
downloaded bytes cannot be revoked. Existing local files require separately reviewed
copy/verification before an S3 switch. Pre-M12 untracked filesystem orphans require
inventory review. APPLIED adoption originals/assets and retained event references are
not purged automatically. No gallery/avatar, AI image generator, broad admin object
browser, CDN provisioning or scheduled production worker was introduced.

**Recommended M13 — Staging provider certification and operational release rehearsal.**
Separately authorize isolated staging credentials/services; certify storage, mail,
payment/Wallet contracts, private workers/alerts, backup restoration, schema adoption
and runtime/security/load behavior against the release matrix. Resolve required
business/legal decisions explicitly. This is a recommendation only; M13 and any
deployment remain unstarted and require a new instruction.
