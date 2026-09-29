# Provider certification record - M14

## M14 current state

No dedicated external account/resources or physical devices were supplied. Every real
provider remains **NOT CONFIGURED / BLOCKED BY USER ACTION / PRODUCTION CERTIFICATION
STILL REQUIRED**; no row below is upgraded from local contracts to sandbox-certified.
No hosted deployment, real payment/mail/AI/storage/Wallet call or DNS change occurred.
Exact secure variable names, account actions and resume steps are in
[M14-CERTIFICATION](M14-CERTIFICATION.md). Actual workflow status is in
[STAGING-ACCEPTANCE](STAGING-ACCEPTANCE.md); devices and launch decisions are tracked in
[PHYSICAL-DEVICE-QA](PHYSICAL-DEVICE-QA.md) and [BUSINESS-SIGNOFF](BUSINESS-SIGNOFF.md).
M14 patched vulnerable application dependencies; [DEPENDENCY-SECURITY](DEPENDENCY-SECURITY.md)
records one remaining moderate transitive advisory and its inspected reachability.
The detailed M13 procedures and local matrix below remain applicable and historical.

Date: 2026-09-28. Branch: `astra/ticketchile-v2`. Starting release: M12
`7f34bf0aa3c2e1af6ec9447ee15315a42b24e46d`. This is the authoritative current matrix;
earlier milestone matrices describe historical implementation status.

No dedicated provider credentials or authorized hosted staging project were supplied.
No production credentials were used, inspected for validity, or copied. Local fixture
transports and generated signing keys are not provider certification. No deployment,
DNS change, production scheduling, real delivery or financial transaction occurred.

## Initial gap inventory

| Area | State at M13 entry | Gap |
|---|---|---|
| Application | M1–M12 committed; clean tree | Hosted integration/HTTPS acceptance absent |
| Database | Reconstructed PostgreSQL contract, disposable local fixtures | Dedicated managed staging instance, restricted roles, backups/PITR/grants unprovisioned |
| Migrations | Immutable 0001–0011, fresh/legacy tests | Real catalog reconciliation and managed-provider rehearsal absent |
| Workers | Private bounded domain services | Scheduler/runtime/on-call absent; scheduler overlap wrapper added in M13 |
| Stripe/Webpay/Flow | Implemented; transport contracts | Dedicated sandbox accounts and reachable callbacks absent |
| Fintoc | Disabled/incomplete | Complete approved adapter absent; not expanded in M13 |
| Resend | Durable queue, retry/fencing | Sender/recipient isolation and real deliverability absent; recipient guard added in M13 |
| OpenAI | Structured proposal adapter | Explicit nonproduction project/key/model/budget/quality review absent |
| Media | M12 private S3 adapter/lifecycle | Dedicated bucket/IAM/provider behavior certification absent |
| Wallet | Owner-bound local JWT and current QR generation | Demo issuer/test accounts and actual device verification absent |
| Observability | Sanitized errors/audit, AI outcomes | Hosted capture/alerts/retention/on-call absent |
| Vercel | CLI installed; no repository `.vercel` project link | Account/team/project association and isolated Preview config not established; no remote account access attempted |
| Environment | Variable template and per-feature checks | Cross-provider/DB/origin isolation and recipient safety added in M13 |

## Authoritative matrix

`Local` means fixtures/contract doubles, never a hosted provider browser session.
`Unknown` means production configuration was deliberately not inspected. Every real
provider row is **EXTERNAL VALIDATION REQUIRED** / **EXTERNAL CERTIFICATION REQUIRED**.

| Provider | IMPLEMENTED | CONFIGURED STAGING | CONTRACT TESTED | SANDBOX VERIFIED | BROWSER VERIFIED | PHYSICAL DEVICE VERIFIED | PRODUCTION CERTIFICATION REQUIRED | PRODUCTION ENABLED |
|---|---|---|---|---|---|---|---|---|
| Stripe | Yes, checkout/webhook/full-order refund | No | Yes, local | No | Local app only | No | Yes | Unknown; not enabled by M13 |
| Webpay | Yes, create/commit/status | No | Yes, local | No | No hosted round trip | No | Yes | Unknown; not enabled by M13 |
| Flow | Yes, create/signed status/callback | No | Yes, local | No | No hosted round trip | No | Yes | Unknown; not enabled by M13 |
| Fintoc | No complete adapter | No | Disabled endpoints only | No | No | No | Yes, after implementation | Code disabled |
| Resend | Yes, queued delivery | No | Yes, TEST and SDK double | No | Local queue effects only | No | Yes | Unknown; not enabled by M13 |
| OpenAI | Yes, structured proposals | No | Yes, fake transport/schema | No | Local rules only | No | Yes, if enabled | Unknown; disabled in rehearsal |
| S3-compatible media | Yes | No | Yes, commands/signing/doubles | No | Local storage only | No | Yes | Unknown; not enabled by M13 |
| Google Wallet | Yes, signed save URL | No | Yes, synthetic RSA/ownership | No | Local signing only | No | Yes, if enabled | Unknown; not enabled by M13 |

## Common certification procedure and evidence

Use [STAGING-RUNBOOK](STAGING-RUNBOOK.md) first. `S` below is the exact HTTPS
`STAGING_ORIGIN`, also `APP_BASE_URL` and `NEXTAUTH_URL`. Never substitute the
production hostname. Record commit/build, deployment URL, provider account environment
identifier (not credentials), time, synthetic case ID, expected/actual outcome,
sanitized local order/payment IDs, callback status and worker outcome. Keep tokens,
signed URLs, email bodies, private prompts and raw provider payloads out of screenshots/logs.

For each enabled payment provider: use a verified synthetic buyer, published synthetic
event with known integer CLP prices, and an approved **test-only** explicit fee policy.
Create through the real checkout UI. Verify amount/currency, persisted hold and order
binding, one paid evidence record per observation, one fulfillment/order and expected
ticket count. Confirm current-owner account/QR access, foreign-ID denial and durable
mail job. Replay the authentic callback twice, then out of order. Cancel/fail a second
purchase. Expire a third hold before delivering paid evidence: expect PAID+REVIEW and
no oversell. Browser navigation alone must never prove payment. Use small cases, no
provider load testing. Preserve pending attempts on disable/rollback.

### Stripe

Required: dedicated sandbox `STRIPE_SECRET_KEY=sk_test_…`, that endpoint's
`STRIPE_WEBHOOK_SECRET`, `STRIPE_ENABLED=true`; full-order refund certification also
requires `STRIPE_REFUNDS_ENABLED=true` and explicit authorized admin policy approval.
No live keys. Endpoint: `POST S/api/payments/stripe/webhook`; subscribe to Checkout
completion/async success/async failure/expiry and refund created/updated/failed events
handled by the adapter. Success navigation: `S/checkout/confirm?session_id=…`.

Run the common cases plus provider-required authentication, duplicate webhook delivery,
unchanged PaymentIntent binding and a full unused-order test refund. Check UNKNOWN on
uncertain refund responses; only confirmed completion cancels the mapped current
owner's tickets. Test wrong amount/currency/metadata and invalid signature using the
contract suite, never by fabricating a successful public callback. Local SDK doubles
passed; no real Stripe session or webhook delivery was certified. Production onboarding
needs merchant activation, appropriate account permissions and independently configured
live endpoints. [Stripe testing](https://docs.stripe.com/testing) defines sandbox-only
test values; never use real cards for this procedure.

Kill switch: `STRIPE_ENABLED=false` stops new checkout; independently disable refunds.
Valid existing callbacks/reconciliation remain available with correct retained test
credentials. Revoking a compromised credential is a separate incident action; don't
switch a database to another provider environment to recover it.

### Webpay

Required: explicitly provisioned integration commerce code/API key,
`WEBPAY_ENV=integration`, `WEBPAY_ENABLED=true`. Creation uses
`S/api/payments/webpay/create`; exact return is `S/api/payments/webpay/return` (GET/POST).
Complete provider redirect, return and authenticated commit; independently compare
buy order, hold session, CLP amount and success code. Repeat return, simulate uncertain
commit then status recovery, cancel, decline, and late return. TBK_TOKEN/order-only
cancellation must navigate without creating paid evidence. No integration credentials
were assumed from published samples. Local contracts passed; browser/provider
certification pending. Obtain current integration cases and production onboarding from
[Transbank](https://www.transbankdevelopers.cl/documentacion/webpay-plus); the documentation
fetch was unavailable during this rehearsal, so no current account-specific requirement
is asserted. Refund execution is not implemented. Disable `WEBPAY_ENABLED`; retain
integration config for pending verified returns. Never change it to production in place.

### Flow

Required: dedicated sandbox keys, `FLOW_BASE_URL=https://sandbox.flow.cl/api`,
`FLOW_ENABLED=true`. Confirmation: `S/api/payments/flow/confirm`; compatibility webhook:
`S/api/payments/flow/webhook`. Return: `S/api/payments/flow/kick` (legacy `/return`
delegates). Complete the common cases and token substitution, supplied invalid signature,
repeated confirmation and signed merchant status retrieval. A token alone cannot expose
buyer tickets. See [Flow API](https://developers.flow.cl/api). No sandbox credentials
or reachable callback existed; keep disabled. Production merchant configuration and
provider-specific operational acceptance remain pending. Disable new creation with
`FLOW_ENABLED=false`; preserve the same environment for pending status verification.

### Fintoc

Remain disabled; create/webhook are 410. Required future work: approved checkout adapter,
durable mapping, authenticated retrieval, signature/timestamp/replay checks, merchant/
amount/currency/order/environment binding, uncertain outcome recovery and sandbox
certification. No large new adapter was added. Manual bank transfer also remains disabled.

### Resend and email

Required: dedicated nonproduction account/key and verified test sender, `MAIL_TRANSPORT=resend`,
`MAIL_RESOURCE_ENVIRONMENT=preview`, `RESEND_API_KEY`, `FROM_EMAIL`, separate data key,
and `MAIL_ALLOWED_RECIPIENTS` containing at most 20 exact controlled inbox addresses.
No wildcard/domain allowlist or recipient rewriting. All recipients and the configured
sender are checked immediately before SDK delivery, including retries of saved payloads.
Nonallowlisted delivery fails and never reports success. The unused legacy direct-send
helper was removed. In local tests every completed injected delivery records TEST.

Run `runWorkerBatch('mail',25)` in the private staging runtime. Certify purchase ticket/
QR attachment, verification, recovery, staff invitation, transfer invitation/acceptance/
cancellation and courtesy delivery. Security outbox uses the same encrypted queue.
Separate refund/settlement notifications are **not implemented**; don't claim delivery.
Fail transport after a committed business action, restore it and retry with the same
idempotency key. Simulate lost response/expired lease and check dedupe; uncertainty
past 23 hours moves to REVIEW rather than risking resend after the provider's
[24-hour idempotency window](https://resend.com/docs/dashboard/emails/idempotency-keys).
`MAIL_MAX_ATTEMPTS` independently caps failures at 10 by default (configurable 1–20),
including malformed encrypted payloads before a send; exhaustion requires REVIEW.

Production requires verified sender ownership, SPF/DKIM and an approved DMARC policy,
controlled bounce/complaint webhook ingestion/suppression and an operational owner.
Domain verification is described by [Resend](https://resend.com/docs/dashboard/domains/introduction).
Bounce/complaint handling and DNS readiness are not certified or implemented here.
No DNS was modified. Disable with `MAIL_TRANSPORT=disabled`; pending encrypted jobs
remain. Restore data keys and original payloads before resuming; don't bulk-reset jobs.

### OpenAI

Required: explicitly authorized separate nonproduction project/key and spend controls,
`AI_RESOURCE_ENVIRONMENT=preview`, `AI_PROVIDER=openai`, explicit `AI_MODEL` present
in `AI_ALLOWED_MODELS`, selected `AI_FEATURES`, separate encryption key and low configured
hourly limits. No model is selected implicitly. Disable with `AI_PROVIDER=disabled`.
No live key was supplied; local rules, schema/transport/error/rate/scope tests passed.

Run six small cases, one each for a Chilean concert, party, festival, theatre, sports
event and workshop. Allocate tasks across simulator, event proposal, rewrite, FAQ/SEO
and analytics; keep the total approved call budget small and record tokens/latency/outcome.
For every case supply a synthetic title/city and deliberately omit exact venue/address,
legal age and critical price. Expected: missing facts remain missing, no legal/location
invention, price/capacity suggestions stay editable and require explicit confirmation,
no publication or operational action. Verify analytics references only supplied metrics,
foreign tenant rejection, malformed/refused/timeout handling and manual editing recovery.
Do not log full prompts or send buyer/attendee data. Human quality review remains pending.

The adapter uses Responses `text.format` with a strict closed schema, separate untrusted
input and no tools, consistent with [Structured Outputs](https://developers.openai.com/api/docs/guides/structured-outputs).
`store:false` is not a claim of zero provider retention; approve applicable
[data controls](https://developers.openai.com/api/docs/guides/your-data) before enabling.
Production project/model/privacy/budget approval is separate. Disabling AI preserves
events and stored proposals; it does not authorize deleting retained ciphertext.

### S3-compatible media

Required: private dedicated `ticketchile-preview-*` bucket, prefix `preview/v1`, dedicated
least-privilege key, exact region/optional HTTPS endpoint and `MEDIA_ENVIRONMENT=preview`.
Follow [MEDIA-ARCHITECTURE](MEDIA-ARCHITECTURE.md) IAM, checksum and versioning contract.
No staging bucket was accessed. Certify conditional PUT, missing HEAD behavior, SHA256,
three normalized variants, private draft denial, authorized preview, publication read,
replacement/revision conflict, orphan grace and retryable cleanup. Unpublish and confirm
new anonymous reads fail; prior URLs/cache can persist 60 seconds and downloads cannot
be recalled. Verify versioned deletion semantics, backup restore and exact CSP origin.

The local restore rehearsal additionally exercises legacy dry run, bounded apply,
idempotent resume, retained originals and restored variant hashes. Lifecycle regression
tests cover conflicts/checkpoints/cleanup/failure. `MEDIA_UPLOADS_ENABLED=false` stops
new uploads/adoption writes while reads continue; stop cleanup separately during an
incident. `MEDIA_PROVIDER=disabled` also disables reads. Never point preview at a
production bucket to repair a storage outage.

### Google Wallet and physical QR

Required: dedicated demo/test issuer, service account permitted on that issuer,
`WALLET_RESOURCE_ENVIRONMENT=preview`, issuer ID/private key/account email, approved
test Google accounts and exact staging origin. No issuer was available. Local tests
sign with generated RSA keys, enforce current owner and use generation-specific object
IDs; old transferred credentials fail at the TicketChile scanner. Follow Google's
[demo and publishing-access process](https://developers.google.com/wallet/generic/test-and-go-live/request-publishing-access).
Do not mark production approved from a successful local JWT.

Physical procedure: phone A displays the buyer ticket/Wallet pass, phone B is an
explicitly assigned door user. Record OS/browser/device/build, viewport, brightness
low/high, small/large screen, focus distance, rapid scans and venue network. Test valid,
duplicate, wrong event, refunded/cancelled, old transferred and new recipient QR;
manual lookup/recent scans/stats stay event scoped. Disconnect B: no offline admission.
Repeat login/logout/MFA and transfer handoff on actual HTTPS. **PHYSICAL DEVICE REQUIRED**;
browser canvas QR decoding is not physical certification. No remote Wallet removal is
implemented or promised. Disable by removing Wallet configuration; scanner generation
and ticket state remain authoritative even for already saved passes.
