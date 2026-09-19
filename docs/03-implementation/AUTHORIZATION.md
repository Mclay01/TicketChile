# Authorization boundaries — current through M6

M1 (`39a0931`) and M2 (`319cb5f`) remain implemented. M3 extends their server guards with the shared persisted identity and staff model; client roles, cookie presence, event codes and knowledge of identifiers never authorize access. Full identity/session/recovery/MFA/delivery/rate/audit details are in [IDENTITY-SECURITY.md](IDENTITY-SECURITY.md).

## Identity authority

Admin and organizer cookies resolve hashed `identity_sessions` with expiry, revocation, current account version, live principal state and completed required MFA. Buyer NextAuth sessions resolve a persisted session reference on each use. Login rotates tokens; logout/reset/MFA/privilege changes invalidate sessions. Legacy sessions and signed organizer-ID cookies are not accepted. ADMIN and SUPERADMIN pass operational admin guards; only SUPERADMIN may change identity roles/disabled state through `/api/admin/identity`.

M6 replaces the organizer panel with live capability-scoped owner/buyer-staff pages. The separate legacy payments page retains its M1 owner guard. Exact organizer panel page paths now bypass the organizer-cookie-only preliminary proxy check so persisted buyer-staff sessions can reach the authoritative server guards. Scanner compatibility exceptions remain; legacy organizer APIs, legacy payments and admin proxy checks remain. Neither a page URL nor a present cookie grants access.

## Persisted capability model

`organizer_staff` associates a verified buyer UUID with a tenant owner. Each membership has a role, a nonempty subset of that role's capabilities, optional event IDs and revocation state. A NULL event list means all events of that tenant, not all tenants. Explicit event IDs must belong to the tenant. SQL constraints prevent role-incompatible capabilities; guards repeat the intersection. Disabling the tenant owner suspends its staff grants and invitation acceptance too.

| Role | Maximum capability set |
| --- | --- |
| ORGANIZER_OWNER | event.read/edit, scanner.read/checkin, attendees.read/export, finance.read, staff.manage, audit.read for own tenant |
| ORGANIZER_MANAGER | event.read/edit, scanner.read/checkin, attendees.read/export |
| ORGANIZER_DOOR | scanner.read/checkin only |
| ORGANIZER_FINANCE | finance.read only |
| ORGANIZER_SUPPORT | attendees.read only |

No staff role receives staff.manage, refund, settlement, bank-account or publication authority. No global admin scanner override exists. Owner authority derives from the organizer identity and event mapping, not an assignable invite role. Additional manager/finance/support product screens and capability consumers remain later milestones; an enumerated capability does not imply an implemented workflow.

`requireEventAccess(eventId, capability)` checks live `security_can_event(kind,id,version,event,capability)` against active/verified/approved tenant ownership and current grants. Scanner feeds/statistics, check-in and CSV repeat that policy in their data SQL. Check-in uses an atomic VALID-to-USED update and an audit insert in the same transaction. Revoked memberships, changed role subsets, expired/revoked sessions and disabled users/tenants fail. Already-running database statements use normal PostgreSQL transaction snapshots; this is not a promise to undo an operation already committed before revocation.

`requireOrganizerCapability` authorizes tenant-wide actions; event-scoped membership alone cannot grant an all-tenant operation. Invitations are owner-created, hashed, 48-hour, email-bound and single-use. Verified buyer acceptance checks exact recipient and active tenant. Duplicate active memberships/pending invites conflict; expired invites can be replaced; revocation is persisted. Owner-only staff permission updates validate the requested subset and event list and record audit. No invitation may grant ownership. Delivery uses the encrypted transactional outbox, without external email in M3.

## Ticket, scanner and payment route inventory (M1?M3)

| Surface | Authority and behavior |
| --- | --- |
| `/api/qr`, `/api/demo/qr` | Shared handler; NextAuth session email and current persisted ticket ownership before signing. Optional signed `t` is an identifier, never buyer authentication. Conflicting ticket/event parameters fail. Only VALID tickets can generate QR. |
| `/api/wallet/google/save-url` | Same owner-scoped lookup for `t`, `ticket_id` and `ticketId`. No ID-only fallback. Wallet barcode always uses the existing signed `tc1` format; no `TICKET:id` barcode. No original buyer name or email in the pass. |
| `/organizador/eventos/[id]/scanner` | MFA-ready owner session on the organizer URL; `/scanner/[id]` also admits verified buyer staff with persisted `scanner.read`. Live `security_can_event` plus `events JOIN organizer_events`. Real database event title/slug/location; no fixture event lookup. |
| `/api/scanner/checkin`, `/api/demo/checkin` | Same canonical POST handler; persisted `scanner.checkin` capability checked server-side before QR processing. Signed QR must match the event. Explicit manual ticket ID is allowed only after this same authorization; it cannot override an invalid QR. Atomic VALID-to-USED update repeats event, current identity version and capability predicates. Duplicates/cancelled/wrong-event/unknown tickets do not enter. No attendee email is returned. |
| `/api/scanner/event-stats`, `/api/scanner/event-checkins` and matching `/api/demo/*` aliases | Persisted `scanner.read` capability before aggregate or ticket read; live capability predicate also in the data query. No global statistics or attendee email in scanner feeds. |
| `/api/scanner/export`, `/api/scanner/export-checkins` and matching `/api/demo/*` aliases | Shared services independently require `attendees.export` for the event, including calls through the old `organizer.pg.server` exports. Filters only narrow scope; no export-secret bypass. CSV quotes cells and neutralizes formula prefixes, including leading whitespace. |
| `/api/demo/reset`, `reset-checkins`, `paid-order`, `cart-hold`, `cart-hold/release`, `stats` | 410, no fixture/database reads or writes. No production paid-ticket simulator or check-in reset handler remains. |
| `/api/dev/seed` | Existing production 403 checked before calling seeder; still a development-only route, not production provisioning. |
| `/api/payments/status`, `/api/payments/stripe/status`, `/api/payments/flow/status` | Session-derived payment owner predicate before provider calls or finalization. Stripe accepts both existing query spellings, `session_id` and `sessionId`, with identical checks. Flow status no longer returns raw provider data. Returned tickets are additionally filtered by current ticket owner, so a previous purchaser cannot recover transferred tickets through an order. |
| `/checkout/[eventId]`, `/checkout/confirm`, legacy `/checkout/success` | Checkout/confirmation require login; success only forwards to the protected confirmation. IDs in callback URLs confer no access. Confirmation data is independently protected in the APIs. |
| `/api/payments/{stripe,transfer,webpay,flow}/create` | Buyer login and same-origin browser check before domain work. `owner_email` is set from the session; a supplied `ownerEmail` is ignored. Existing Stripe/transfer payment retries lock and validate hold owner and payment owner/provider; conflict updates cannot overwrite ownership or purchase fields. Webpay creates only new holds/payments. |
| `/api/payments/flow/kick`, `/api/payments/flow/return` | Form POST from provider only performs a 303 navigation. GET requires buyer login and owned stored token before confirmation navigation. JSON kick requires session, same origin and matching payment/token ownership before reconciliation. |
| Flow `/confirm`, `/webhook` | One callback handler for both aliases/methods. Optional supplied signature must validate. Callback without browser session is allowed only after an independent authenticated Flow status call matches stored provider token, commerce order, amount and currency. Responses contain no payment/ticket/PII payload. |
| Webpay `/return` GET/POST | Stored provider token must match independently committed provider response: buy order, hold session, amount, CLP currency and approved status. Browser cancellation fields/order IDs alone perform navigation and never cancel a stored payment. Responses redirect to buyer-protected confirmation. |

## QR and email authority

The existing HMAC-SHA256 `tc1` signer and timing-safe verification remain unchanged. Buyer QR/wallet reads require ownership in addition to a valid signature. Scanner validation requires authorized event operation plus signature/event/ticket state. Already-issued QR tokens are not rotated or revoked by an ownership transfer in this milestone; a transfer/key-rotation design remains future work.

Payment email paths no longer fetch a public QR URL, use request-derived hosts or forward cookies. `deliverPaidOrder` requires persisted PAID evidence for the order, claims only VALID tickets, rereads the current owner and renders each QR locally. It sends only to that owner. The original buyer/contact does not receive a credential after an ownership change. Missing legacy email columns skip automatic delivery; resend remains available to the owner. M4 supersedes this historical claim mechanism with durable jobs, encrypted snapshots, leases and bounded retries; see the M4 section below.

New checkout requires login even when the provider browser return has no cookie. The form return redirects to a same-site GET so the session can be restored. Legacy guest orders are accessible only after login with their persisted owner email (buyer email fallback only when owner is blank). Checkout copy now distinguishes contact email from entry ownership/delivery. Organizer payment UI refreshes its scoped list; it no longer attempts buyer-only confirmation or reconciliation shortcuts.

## Identity and hold compatibility endpoints

`/api/auth/signup`, organizer registration and both verification endpoints share the M3 registration/token services. Verification is POST-only; legacy six-digit codes/old email-token storage no longer authorize verification. The shared security form supports issuing a fresh verification token for an existing unverified identity. Recovery/reset/MFA/invite endpoints are enumerated in [IDENTITY-SECURITY.md](IDENTITY-SECURITY.md).

Admin bootstrap, organizer bootstrap/create-user and organizer SSO return 410 at their handlers. There is no header-key or allowlist bypass. Local provisioning is the explicit loopback-only CLI; production provisioning needs a reviewed operator procedure. Logout aliases use the same POST revocation service; GET does not mutate.

`/api/demo/hold` is the real retained inventory handler, now buyer-authenticated and rate-limited. It stores the session owner, ignores client TTL and enforces transactional quantity/account quotas. Stripe/Webpay/Flow hold writers use the same quota boundary. Stripe/transfer retries also require the stored hold owner; an unowned legacy hold cannot be claimed by ID. Existing demo cart/paid/reset mutations remain retired.

## Remaining exposures and validation limits

- Email-based ticket ownership, guest-order reconciliation, transfer/revocation of already-issued QR/Wallet credentials and key rotation still need explicit product/security design.
- Versioned local migrations are tested, but no production catalog is certified. Old sessions are intentionally invalidated; privileged MFA onboarding, recovery-email proof, SUPERADMIN provisioning, data-key management and a restricted DB role are deployment prerequisites.
- Security delivery is encrypted/queued only. M4 implements shared delivery worker services and retries; production scheduling, sender rehearsal, key rotation and retention remain operational prerequisites.
- New hold ownership/rate/quotas mitigate abuse. M4 adds publication/quantity rules, callback verification, idempotent finalization and shared inventory locking; production concurrency/load and merchant end-to-end certification remain unverified.
- Audit UPDATE/DELETE is rejected, but database owner/TRUNCATE/trigger changes need restricted grants and external archival. Staff UI, non-scanner capability workflows and export pagination/volume controls remain later milestones. Refund/settlement/bank mutations are not implemented.
- Local PostgreSQL proves session expiry/revocation, tenant/grant policy, token single-use, TOTP replay, quotas and concurrent check-in. M1/M2 route/provider contracts still use explicit doubles. Browser/mobile/camera/Google OAuth, actual email/Wallet/provider sandboxes, distributed load and production infrastructure have not been exercised.

No production credentials/data/deployment were used. M5 is next after M4; local milestone verification does not certify complete-platform production readiness.


## M4 payment and delivery boundaries (supersedes historical lifecycle details above)

- Stripe/Webpay/Flow create handlers share verified buyer, same-origin, rate, server-price, hold-owner and durable retry-key guards. Manual transfer returns unavailable until a reviewed approval workflow exists; it does not present bank details. Fintoc create and webhook return 410. No disabled-provider callback can reach an issuer.
- Only provider adapters produce trusted payment observations. Stripe SDK verifies the raw webhook signature and timestamp; required merchant-mode/session/client-reference/metadata/amount/currency/intent bindings must match. Webpay authenticates commit/status and matches exact stored buy order, hold session and CLP amount. Flow independently retrieves signed merchant API status for the stored token and verifies commerce order, amount/currency/state and Flow order. Identifiers alone never authorize finalization or buyer reads.
- Payment evidence commits separately from fulfillment. The single issuer requires verified PAID, matching hold/payment owner/event, canonical total and active inventory. Unique order/hold and ticket issuance slots back idempotency. Late-paid/expired inventory goes to REVIEW without issuing or inventing refunds. Even a legacy PAID label cannot be certified by a pending provider response.
- Public `/api/demo/availability`, `/api/demo/remaining`, `/api/remaining` share one published-event inventory service. They no longer return attendee email/check-ins or use a separate expiry writer. Operational scanner statistics still require the M3 capability guard.
- Owner-scoped status/confirmation and all Flow/Webpay/Stripe compatibility routes remain. The guest PRD review found no explicit guest checkout requirement; the existing verified buyer model is preserved. Browser redirects, provider tokens and contact email do not grant ticket access. An explicit guest capability lifecycle remains future product/security work.
- Finalization queues unique mail jobs; status polling sends nothing. Resend requires current ownership, VALID ticket and persisted paid order, queues with HTTP 202 and cannot add recipients. The worker rechecks that authority before local QR rendering/delivery, preserving M2 signing primitives. Security outbox messages use the same worker with expiry checks. Failures do not roll back purchases; jobs retry under lease/provider idempotency or move to review after uncertainty exceeds the safe retry window.

No public worker/cron endpoint or refund authority was introduced. Internal service scheduling and a restricted runtime DB role are deployment prerequisites. Full configuration, state model, provider limitations and migration risks: [PAYMENTS.md](PAYMENTS.md), [MIGRATION-PLAN.md](MIGRATION-PLAN.md). Existing QR/Wallet transfer and key rotation limitations remain unchanged.


## M5 public/account/media surfaces

Public Home, catalog, category, detail and the three `/api/events` lookup/list aliases now share the published-event database service. Unpublished-event ID/slug knowledge does not grant public access. Search inputs are bounded parameters, and sort fragments are fixed allowlisted strings.

New account page services independently resolve the live buyer identity. Ticket lists/detail use the existing current-owner SQL precedence; original order/buyer identity does not recover a transferred ticket. Orders and their payment summaries use separate persisted owner predicates. No provider references, privileged identity state or original purchaser PII are exposed. QR/Wallet/resend continue through the unchanged M2/M4 owner/state services; UI visibility does not replace their guards. Anonymous pages redirect to login, while foreign ticket IDs yield not-found. No transfer mutation or guest ID capability was introduced.

`POST /api/media` requires same-origin, persisted rate limits and live event `event.edit` or tenant-wide capability. A simple UUID, tenant ID or event code is never upload authority. Normalization rejects active/unsupported image types and bounds bytes/pixels; writes use immutable generated keys. Metadata and audit commit together. New organizer submissions require the current owner capability and only accept media references from their own tenant; the bounded submission and its audit commit together.

`GET /api/media/:id` reads a draft only with live event/tenant capability. Public access requires an actual reference from a published event; unpublishing removes that grant on subsequent reads. Responses are private/no-store. Legacy `/api/event-media/:id/:slot` exposes only a fixed raster field on a published event and normalizes it to bounded binary output. The local media adapter is unavailable in production; an explicit production adapter remains a deployment prerequisite.

M5 adds no public QR fetching, client pricing authority, scanner role shortcut, export bypass or payment confirmation path. Earlier identity/payment/production-operation limits remain in force. Profile editing, safe ticket transfer, production media lifecycle and related revocation/key policy remain pending.

## M6 organizer surfaces

`/organizador`, `/organizador/eventos`, creation and Event Center pages use the live M3 principal and persisted event scope. Navigation reflects capabilities, and every section's server service independently enforces them. Door/support never receive finance sections or payment totals; an event-scoped manager cannot create new tenant events. The owner-only legacy `/organizador/pagos` remains separately protected. No new role or capability grant was added to migration 0003.

`POST /api/organizer/events` requires tenant-wide `event.edit`. `GET/PATCH /api/organizer/events/:id` require `event.read`/`event.edit`. Lifecycle POST additionally requires the active approved owner, current revision, allowed transition, applicable checklist and explicit confirmation. Proposal POST requires event editing and a persisted rate limit; it cannot transition lifecycle. All writes are same-origin and body bounded. Actor IDs/tenant IDs/client roles in input are not authority.

Sales and analytics repeat `finance.read` in their scoped SQL; attendees repeat `attendees.read` with bounded search/pagination; access metrics repeat `scanner.read`; audit history requires `audit.read`. Staff screens require `staff.manage` and call the existing owner-only M3 invite/update/revoke endpoints. CSV reuses M2 export authority and formula protection. Reads return neither provider credentials nor buyer QR credentials.

Lifecycle and inventory changes share M4's transaction lock. Check-in now also takes that lock and excludes cancelled/ended events, including `/api/demo/checkin`. Cancellation invalidates unused tickets and releases holds; paid evidence after release enters M4 review without issuance. Price changes do not rewrite purchases. Detailed transitions, pause semantics, review policy and critical-edit restrictions: [EVENT-LIFECYCLE.md](EVENT-LIFECYCLE.md).

All three legacy admin approval/publication mutation routes authenticate then return 410, and the old organizer submission route is retired after authentication. The unused boolean publication writer and organizer demo UI/fallback have been removed. SQL enforces consistency between lifecycle and the public compatibility boolean. Legacy pending submissions remain stored for a separately reviewed M9 migration; no legacy alias can bypass the new publication checklist.

New image references must belong to the tenant and be readable/editable in the source event scope. `/api/event-preview-media/:id/:slot` requires live event-read capability before reading a fixed legacy raster field, repeats scope in SQL, normalizes output and uses private/no-store. Unchanged legacy bytes stay intact; no base64 enters client event props. Production media storage still fails closed.

Production AI remains unavailable. The explicitly configured development-only local rules adapter is visibly identified and cannot activate in production. Current/proposed fields require review, sensitive values require confirmation, and apply uses the same versioned draft save. No external provider/PII transmission or automatic publication, refund, communication or promotion occurs. M7 will add the real provider integration.

Remaining limits include in-memory CSV volume, bounded 200-event dashboard/list, M7 provider AI, M8 ticket operations, M9 admin moderation/refunds, legacy critical corrections, production storage/workers/grants/key management, safe transfer and provider/browser certification. M6 does not certify the whole platform for production.
