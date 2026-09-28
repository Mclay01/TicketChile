# Admin and finance operations — M9

Implemented locally on 2026-09-28. Migration `0009_admin_finance.sql`; no production adoption or provider certification was performed.

## Authority and operational boundaries

The `/admin` shell uses the persisted ADMIN session and MFA from M3. `security_can_admin` repeats active-account, current credential version, enabled MFA, role and capability checks. ADMIN receives operations read, moderation, support, audit and reporting capabilities. Financial detail, refund execution, settlement changes and commission configuration are not default ADMIN permissions. SUPERADMIN has all listed capabilities. Narrower explicit grants are persisted in `admin_users.capabilities`; provisioning these remains a controlled database/identity administration task, not a browser role claim. The existing last-superadmin and session-revocation protections remain in place.

`/api/admin/operations` verifies origin, bounded body, rate limit and live capabilities. Each operation requires a reason, exact action/target confirmation, and durable request key. The transaction rechecks permissions after taking the existing inventory lock. Reusing a key with a different actor or payload is rejected. `admin_operations` stores immutable before/after decisions; `security_audit` retains append-only actor, target and applicable event/organizer context. Neither table stores raw requests, credentials, QR tokens or provider secrets. Internal reasons and support notes are private but operators must still avoid entering sensitive credentials into free text.

## Organizer and event review

Organizer business review is separate from email verification: PENDING, NEEDS_INFORMATION, APPROVED, REJECTED and SUSPENDED. Existing approval/active flags determine the initial backfill. Approval requires verified email; a decision increments the organizer credential version. Suspension disables organizer authority and consequently its staff's event capability checks. It does not automatically cancel events or refund buyers; event pause/cancellation is a separate confirmed decision.

Admin event moderation uses the same transactional lifecycle logic as organizer publication. Revision checks, publication checklist, hold release on terminal transitions, cancellation ticket invalidation and cancellation-followup state remain authoritative. An administrative pause or changes request sets `moderation_block`; an owner cannot republish through the owner endpoint until admin approval clears it. There is no publication bypass or direct tier/inventory editing in the admin UI.

Legacy submissions remain separate records. Their bounded queue exposes only identity, organizer, title and status; raw submission JSON is never returned. Rejection or an information request records an audited decision. A new current-format organizer draft is required before publication. There is no automatic promotion of legacy payloads to events. Old event approval/publish/unpublish routes and the old organizer approval mutation return guarded 410 responses.

## Payment support

List queries are bounded to 50 rows; search, event, organizer, status and UTC date filters use parameters. Buyer support requires exact email/order/ticket lookup and reveals selected PII only on an audited detail view. No buyer-wide PII CSV exists. Detail shows tickets, mail-job state and decision history; financial detail separately exposes stored evidence, issuance status and purchase commission snapshots.

Rendering never contacts a payment provider. Operators can mark an unissued payment for review or retry the existing local, verified, idempotent finalizer. A retry cannot prove an unverified payment, invent a paid state, restore expired stock or issue duplicate tickets. Provider reconciliation remains the M4 explicitly configured trusted adapter/worker path; the admin read interface is not a provider lookup endpoint.

Support cases persist OPEN / IN_PROGRESS / RESOLVED, contextual IDs and append-only private notes. Order resend uses the existing durable ticket mail queue and current ticket owners, with a ten-minute cooldown and no arbitrary recipient or bulk message. Processing/delivery still requires the separately configured M4 mail worker. Refund, verification and settlement emails were not invented in the absence of approved templates and notification policy.

## Refund lifecycle and provider integration

REQUESTED → APPROVED → PROCESSING → COMPLETED; review may reject before execution. A provider failure becomes FAILED only with authoritative failed/canceled evidence. Timeouts, transport errors and incompatible evidence become UNKNOWN, never success or a proof of no refund.

Technical execution currently supports **full issued-order Stripe refunds in CLP**. `STRIPE_REFUNDS_ENABLED=true` is an explicit server enable flag; it does not waive authorization, MFA, confirmation or policy review. Webpay/Flow requests can be reviewed, but execution is unavailable. Partial refunds, consumed tickets, courtesy orders, payments without a verified issued order, and already allocated settlement payments require separate manual review. No entitlement or legal deadline is inferred from event cancellation.

Requests bind the verified payment to order, event, owner, full amount and immutable ticket mapping. Approval records the policy reference. Execution rechecks the paid/verified/issued amount and order, ticket usage and settlement claims under the inventory lock, then obtains a two-minute claim before network I/O. The provider call uses the stored PaymentIntent and amount, with durable key `ticketchile-refund-<refund UUID>`. It never accepts a browser refund result as evidence.

Retries without a stored provider reference are bounded to 23 hours from the first attempt, below Stripe's documented minimum idempotency retention. After that, creation remains blocked for manual reconciliation; there is no unsafe automatic new key. A stored refund ID uses authenticated retrieval. API responses and signature-verified `refund.created`, `refund.updated`, `refund.failed` webhooks must match refund/payment metadata, intent, currency, amount and prior provider ID. Unknown external Stripe refunds are not automatically adopted. Success is monotonic under duplicate or reordered callbacks.

PROCESSING and UNKNOWN orders are rejected by the canonical scanner update (including its compatibility alias). Only authoritative COMPLETED evidence cancels the mapped still-valid tickets. Other orders are untouched. Completed refunds do not automatically reopen capacity, rewrite payment evidence or erase historical revenue. Requests and approvals alone do not invalidate admission.

Provider reference: [Stripe create refund](https://docs.stripe.com/api/refunds/create), [retrieve refund](https://docs.stripe.com/api/refunds/retrieve), [refund states](https://docs.stripe.com/api/refunds), [idempotent requests and retention](https://docs.stripe.com/api/idempotent_requests). Validation used injected responses and signature-verification doubles with disposable PostgreSQL; no live merchant refund or callback certification is claimed.

## Commission snapshots

No default percentage, including 9%, is introduced. A confirmed policy version specifies GLOBAL, ORGANIZER or EVENT scope, future effective timestamp, basis points, fixed CLP per order and an approved policy reference. Event override wins over organizer, then global. Within a scope, the most recent effective version wins deterministically.

The supported formula is `floor(charged CLP × basis points / 10000) + fixed CLP per order`. It is an organizer deduction and does not surcharge a buyer. Configure it only for a contract that approves this base, rounding and payer. Other bases, payer choices and tax treatments are not silently approximated. An excessive commission is rejected, not clamped.

An insert trigger snapshots organizer, gross, commission version and calculated commission when the payment is prepared. Subsequent policy changes cannot alter this snapshot or a prior settlement line. Missing policy is NULL, not zero. Existing payments are deliberately not backfilled from today's configuration; their settlement preparation fails pending a separately reviewed historical adoption procedure. A valid agreed zero commission requires an explicit zero-valued policy version.

## Settlement and external payout records

For one event, a DRAFT captures up to 1000 verified, issued, unallocated payments and their immutable gross/refund/commission evidence. Missing historical commission or active refund review blocks preparation. Each payment has one live allocation claim, serialized against refund and settlement operations. Later purchases remain eligible for another draft. Canceling a draft releases its claims while preserving lines/history.

`net CLP = gross CLP − completed refunds CLP − historical commission CLP + documented signed adjustments CLP`.

Processor fees and taxes are **unknown**, not inferred as actual zero costs. The draft is a calculation before untracked external obligations. Approval requires a policy/ledger reference, a positive balance and explicit accounting review of processor fees, taxes, refund commission treatment and adjustments. No cadence, SLA, withholding rate or fee payer is invented. In particular, a full refund does not silently reverse its historical commission: any approved credit is a separate signed, reasoned adjustment.

Adjustments are append-only and apply only to DRAFT. APPROVED freezes calculation and allocations. PAID requires a unique external reference and an amount exactly matching the approved net, with permission, MFA, reason, confirmation and idempotency. This records a transfer **already made outside TicketChile**; no banking integration or automated transfer exists. Approved/paid corrections and refunds after allocation need accounting review; this milestone does not provide an unreviewed reversal endpoint.

Organizer event finance shows only scoped totals, draft/approved/paid status and history under M3 `finance.read`. Internal support notes and admin policy commentary are not exposed.

## Reporting and bounded operation

The audit viewer exposes selected identifiers/actions, never raw metadata. Financial CSV requires `reports.read`, an explicit interval of at most 31 days, and at most 1000 records. Event/organizer/status/search filters are repeated through the canonical read service, permissions are rechecked per page, formula-leading cells are escaped, and access/export is audited. Oversized exports reject with instructions to narrow scope. This is an operational query export, not an immutable closing ledger or tax statement.

The existing global inventory advisory lock orders local financial writes and identity changes. No provider HTTP call runs while holding it. Larger events, higher throughput, periodic statements, granular monetary adjustments after close and comprehensive load rehearsal remain production follow-ups. No admin AI mutation endpoint was added; AI cannot approve, refund, settle, pay, change roles or alter policy.

## Production prerequisites and unresolved policy

- Adopt 0009 against a reviewed copy of the production catalog with backup, transactional migration, grants and rollback rehearsal. Do not edit 0001–0008 or fabricate historical finance snapshots.
- Approve commission base/rounding/payer, refund eligibility/window/commission treatment, organizer verification evidence, tax/processor-fee accounting, settlement cadence/SLA and adjustment governance.
- Certify Stripe API/webhook behavior with a dedicated test merchant before enabling; configure restricted credentials and the intended refund events. Webpay/Flow execution and partial refunds remain unavailable.
- Reconcile out-of-band provider refunds/chargebacks and existing UNKNOWN cases manually; no autonomous adoption of external money movement.
- Confirm runtime versus migration privileges, key rotation, worker/email delivery, retention/PII governance, load, physical devices and formal accessibility before release.

M9 was implemented and verified locally. No deployment, production credentials/data, real email or live provider operations were used.
