# Payment lifecycle - M4

## Pre-change inventory

The audit started from clean M3 `fd48fc0`. Stripe, Webpay and Flow create routes each reserve inventory and persist payments differently. Stripe webhook/status, Webpay return, Flow reconcile and the disabled Fintoc provider's still-active webhook each mark payments and invoke a legacy issuer. The issuer also exports an unused demo-paid bypass. Transfer creation supplies fabricated fallback bank details. Ticket delivery claims tickets before sending, with no crash recovery; resend sends directly. There are no implemented refund mutations.

Compatibility surfaces: generic payment status; both Stripe session query spellings; Flow confirm/webhook, kick/return and status; Webpay GET/POST return; checkout success/confirm. Demo paid/cart/reset mutations are already retired by M2. All retained surfaces must converge on the same services. The unused Flow `_lib` adapter and unused issuer exports can be removed.

PRD-TICKETCHILE section 10 requires two checkout steps, active methods only, server validation and server prices. It does not specify guest checkout. Existing M1–M3 verified-account ownership remains the baseline without adding a new account requirement. Browser provider returns are not buyer authentication.

## Implementation decisions

Persist a payment attempt before provider I/O. Store verified provider evidence separately from transactional fulfillment so a paid transaction survives issuance failure. Unique order-per-hold and ticket issuance slots prevent duplicate fulfillment. Release and consume inventory under a consistent transaction lock; never hold database locks across external I/O. Late payment after reservation expiry requires review, not overselling or invented automatic refunds.

Provider availability is server-configured and fails closed. Pricing uses persisted hold items; fees require an explicit server policy, with no prototype 9% default. Fintoc remains unavailable at both create and webhook. Manual transfer is asynchronous and never generates paid evidence automatically.

Email uses durable jobs, bounded leases and stable provider idempotency keys. Payment commits do not depend on email. Retry after an uncertain send is bounded by the provider's deduplication window; expired uncertainty requires review.

Provider references: [Stripe fulfillment](https://docs.stripe.com/checkout/fulfillment), [Stripe Checkout creation](https://docs.stripe.com/api/checkout/sessions/create), [Webpay Plus](https://www.transbankdevelopers.cl/documentacion/webpay-plus), [Flow API](https://developers.flow.cl/api), [Resend idempotency](https://resend.com/docs/dashboard/emails/idempotency-keys). Stripe Checkout expiration has a 30-minute minimum; Webpay status can recover an uncertain commit; Flow callbacks require an authenticated status lookup; Resend deduplication lasts 24 hours.


## Runtime contract and state

`payments/create.server.ts` is the sole create service. Every active create handler first enforces M3 verified buyer identity, same-origin and rate limits. A new purchase requires an `Idempotency-Key` of 16-100 alphanumeric/underscore/hyphen characters; the checkout persists a random key plus a SHA-256 form fingerprint in session storage, never the contact details. Retries use the same key. Existing owned holds may be retried without a key. Keys are unique per buyer, tied to a canonical request fingerprint, and cannot change provider or ownership. A changed submitted total fails; omitted totals are calculated exclusively from stored hold items. Quantities must be positive integers, respect account quotas and persisted per-type limits; duplicate type IDs are aggregated. Only published database events can sell.

A payment attempt and its hold commit before external creation. `creation_state` is NEW -> CREATING -> READY, or UNKNOWN if the response/persistence is uncertain. A database claim prevents simultaneous creates. Stripe retries use the persisted attempt ID and stable parameters; stale claims can retry only within the idempotency window and while the reservation remains active. Webpay/Flow have no implemented safe create-retry guarantee: UNKNOWN is preserved for operator reconciliation instead of creating another charge. References and provider intent IDs are unique. No remote call runs under an inventory transaction lock.

`status` remains CREATED / PENDING / PAID / FAILED / CANCELLED. A verified PAID result is never downgraded by an older failure/cancellation, and an old pending observation cannot reopen a terminal failure. `verified_at` is set only by PAID provider evidence, never by a legacy PAID label or browser redirect. `fulfillment_status` is separately PENDING / ISSUED / REVIEW. Status APIs return that distinction; confirmation does not claim issuance while review is needed.

`recordVerifiedPayment` checks provider, stored reference, payment/hold identity, amount, currency and established intent, stores a deduplicated observation and payment state transactionally, and records audit. `finalizePayment` is the sole issuer: recheck verified PAID, payment/hold owner and event, active/unexpired reservation and hold-item total; create one order; transfer held inventory to sold; issue exactly one ticket per purchased unit with a unique `(order_id,ticket_type_id,issuance_index)` slot; consume hold; enqueue unique initial ticket messages; audit and commit. Replays return the existing order. Any issuance exception rolls the whole issuance transaction back while the previously committed payment evidence survives.

A paid callback after expiry/release leaves PAID + REVIEW and issues nothing. The application never recreates inventory or invents an automatic refund. A callback before local reference persistence returns a retryable failure, not metadata-based adoption. Existing unverified legacy PAID transactions require independent provider reconciliation before new issuance.

## Holds and availability

All active inventory writers use transaction advisory lock `7319322`, followed by account quota and row locks. Creation, expiry, cancellation release and fulfillment share the same release-once logic. The global lock is deliberately conservative: transaction throughput/load testing and future event-partitioned locking remain operational work. There are no provider calls while it is held. Existing M3 account quotas remain 10 units/hold, three active holds and 20 held units/account.

Standalone, Flow and Webpay reservations use the existing eight-minute server TTL. Stripe's initial creation claim aligns the hold to its exact Checkout expiration, 35 minutes after the persisted creation timestamp (the provider requires at least 30 minutes); retries never extend that deadline. Late provider settlement is always reviewed. Cleanup runs on hold creation, public availability and the reconciliation worker. Inventory does not depend on browser timers.

`/api/demo/availability`, `/api/demo/remaining` and `/api/remaining` share published-event availability and cleanup. These public routes expose remaining inventory only. The legacy availability handler's buyer/check-in feed and duplicate expiry writer were removed. Scanner statistics continue through M2/M3 capability guards.

## Provider availability and exact status

No configured credentials were inspected or tested. These are implementation capabilities, not assertions that a merchant account is activated or certified. Availability is evaluated on the server and returned without credential values; missing configuration hides methods and create fails closed. Changing availability does not disable verification of existing valid callbacks.

| Provider | M4 behavior | Server configuration |
| --- | --- | --- |
| Stripe | Checkout create, durable session/PaymentIntent binding, raw SDK-verified webhook, owner-scoped retrieve/reconciliation; validates mode, live/test mode, amount, currency, client reference and required metadata. Async success/failure and expiry handled. Card-only creation. | `STRIPE_ENABLED=true`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` |
| Webpay | Exact persisted buy-order/hold-session/amount binding; authenticated commit; status recovery after uncertain/repeated commit. TBK_TOKEN/order-only cancellation is navigation only. | `WEBPAY_ENABLED=true`, `WEBPAY_ENV=integration` or `production`, explicit `WEBPAY_COMMERCE_CODE`, `WEBPAY_API_KEY`; no fallback integration credentials |
| Flow | Shared signed API client; callback token resolves a stored payment, then authenticated status must match commerce order, amount, currency, status and stable Flow order. Optional received signature must validate. | `FLOW_ENABLED=true`, `FLOW_API_KEY`, `FLOW_SECRET_KEY`, `FLOW_BASE_URL` exactly `https://sandbox.flow.cl/api` or `https://www.flow.cl/api` |
| Fintoc | Unavailable; create and former webhook return 410 without reads/mutations. | No environment flag can activate this incomplete integration |
| Manual transfer | Unavailable; create returns 503 after authentication. Existing pending transfers remain pending, cannot produce verified provider evidence or tickets. No fabricated bank details. | No enabling flag until approval/verification operations exist |

All active providers also require `APP_BASE_URL` as an explicit HTTPS origin (loopback HTTP allowed outside production) and `CHECKOUT_FEE_POLICY=none`. The latter is an explicit zero-fee operator choice, not an assumed business policy. Missing/other fee policy disables checkout; future nonzero fees, tax treatment and payer assignment need approved configuration. The 9% prototype fee is not used. There is no default bank recipient, transfer approval SLA, settlement calendar or refund window.

Fintoc remaining work: supported checkout API adapter, durable transaction mapping, provider-specific signature/timestamp/replay validation, independently retrieved payment evidence and amount/currency/order binding, normalization, timeout recovery and sandbox certification before enabling either endpoint. Manual transfer remaining work: verified bank configuration, authorized/audited human approval and rejection, evidence storage, expiry/late-payment handling, operational responsibilities and approved customer policy. Both are intentionally unavailable rather than fake completed flows.

Refund capability metadata distinguishes provider-supported-but-unimplemented (Stripe/Webpay/Flow) from unavailable. No refund execution endpoint or automatic refund policy was introduced. Future refund operations must add amount/partial-refund accounting, explicit role authority, idempotency, provider evidence and audit. Provider reversal/refund states are not silently mapped to a fresh purchase success.

## Route compatibility and ownership

The four retained create routes are thin shared-service wrappers. Generic status, Stripe's `session_id`/`sessionId` spellings, Flow status and Flow kick/return retain owner checks before provider work and owner filtering after it. Status returns only tickets still owned by the current buyer. Webpay GET/POST return and Flow confirm/webhook may verify provider evidence without a browser session but never return tickets/PII. Flow kick/return navigation, checkout success and confirmation cannot grant access from an ID. Unused Flow `_lib` and the old demo-capable issuer were removed after confirming no callers remain. All M2 retired demo mutations remain retired.

PRD section 10 is silent on guest checkout; M4 preserves the existing verified buyer requirement rather than introducing a new guest identity model. Existing guest-era orders need the matching persisted owner account. An ID, callback token, original contact email or QR signature is never buyer authorization. Future guest purchasing requires explicit scoped capability issuance, expiration, recovery and ownership policy across ticket/QR/Wallet/email surfaces.

## Transactional mail

`mail_jobs` is the durable delivery ledger. Initial ticket jobs are unique per ticket and commit with issuance; manual resend is current-owner/VALID/paid-order checked, rate-limited and deduplicated per ticket, recipient and 15-minute bucket. Resend returns HTTP 202 and queued status. No callback or status poll sends directly. The compatibility paid-order helper only enqueues. Tickets remain available in My Tickets regardless of mail configuration/failure.

`processMailJobs` claims bounded batches with SKIP LOCKED, a two-minute lease and a fencing token. It rereads current ticket ownership/VALID state/paid order before internally rendering QR. It encrypts and persists the exact mail body and attachments before the first attempt; retries keep identical content and a stable Resend idempotency key. Missing ownership/expired security messages cancel the job. Failures record generic audit and retry after one minute. A lost response or crashed lease retries within 23 hours of the first attempt; beyond that it moves to REVIEW rather than risking a duplicate outside Resend's 24-hour window. No claim of universal exactly-once network delivery is made.

The same worker imports encrypted M3 `security_outbox` recovery, verification and invitation messages without deleting/replacing their source records. It honors expiry, sends tokens as escaped message text and acknowledges the original row only after successful delivery. `SECURITY_DATA_KEY` is still required to decrypt old security payloads and encrypt delivery snapshots.

Actual delivery requires `MAIL_TRANSPORT=resend`, `RESEND_API_KEY`, `FROM_EMAIL` and the data key. Otherwise the worker returns `attempted:false` and leaves jobs queued. The injected memory transport is only used with synthetic fixture databases; completed jobs explicitly record `delivery_transport=TEST` instead of RESEND. No real mail/provider was called in verification. Existing local inbox tooling remains available; it does not acknowledge delivery.

## Operations and reconciliation - not deployed

A production worker/scheduler is intentionally not installed or invoked. In an approved server runtime, call `reconcilePendingPayments(batchSize)` and `processMailJobs({limit:batchSize})` from a trusted job runner with separately provisioned environment and restricted database access. They are internal services, not public cron endpoints. Reconciliation processes verified-unfulfilled payments and stored pending provider references, records failures and rotates selection by last-reconciled timestamp; batch sizes cap at 100. Mail leases support multiple workers. Provider sandbox and worker deployment rehearsals are mandatory before enabling checkout.

Monitor UNKNOWN/old CREATING attempts, PAID+PENDING, PAID+REVIEW, mail REVIEW, aged pending mail and repeated reconciliation audit failures. Retry verified-unfulfilled rows through the finalizer/reconciler; never insert tickets or flip PAID manually. A process crash before provider-ref persistence needs provider-side merchant/order investigation. Stripe can retry the same persisted create request while eligible; Webpay/Flow uncertain creation requires operator/provider reconciliation and a reviewed reference-binding repair. Do not blindly repeat create or accept a browser-supplied replacement reference. Flow's commerce-ID retrieval could support a later recovery adapter; it is not currently implemented. Webpay status availability is provider-limited, so reconciliation must run promptly.

Before production rollout: catalog reconciliation and migration rehearsal; active legacy payment drain/reconciliation (old Stripe sessions may lack mandatory bindings); explicit fee/provider configuration; verified sender and mail worker; monitoring and review runbooks; DB grants and ciphertext retention/key rotation; merchant sandbox/browser end-to-end tests. Strict new validation is an intentional compatibility boundary, not a silent certification of legacy rows. Paid inventory and mail failures are locally tested, but merchant activation, live financial operations, production throughput and complete release readiness are not certified.

## M6 event operation interaction

New holds additionally require a future event start and active, visible tiers inside their sales windows. Organizer saves/transitions share advisory lock 7319322, enforce summed event capacity and sold+held lower bounds, and never edit existing hold-item price snapshots. Current tier price changes after sales require explicit confirmation; financial summaries use historical paid evidence and prices.

Pause blocks new holds/new payment attempts and public discovery; a previously persisted payment attempt may still finish against its unexpired reservation. Cancellation/end release active holds once. Cancellation invalidates unused tickets and records REVIEW_REQUIRED follow-up; used tickets, payment evidence and orders remain historical. Paid evidence arriving after release goes through the unchanged M4 PAID+REVIEW path and issues nothing. No remote charge cancellation, refund, settlement or automatic buyer communication is implied. [EVENT-LIFECYCLE.md](EVENT-LIFECYCLE.md) defines the owner confirmations and operational effects.
