# Authorization boundaries — M1 and M2

This records implemented behavior, not the future complete RBAC model.

| Surface | Identity / authority | Enforcement |
| --- | --- | --- |
| Admin list/detail/approve/publish APIs | `tc_admin_sess` resolved through `admin_sessions JOIN admin_users`, unexpired | `requireAdmin()` inside each of seven operational handlers; malformed IDs denied; store failures fail closed |
| Admin pages | Same persisted admin identity | `(admin)/admin/(panel)/layout.tsx`; public login outside this group; URLs unchanged |
| Organizer dashboard API | Persisted verified and approved organizer session | Existing shared organizer guard, followed by `...ByOrganizer(organizerId)` |
| Organizer payments page | Same approved organizer identity | Explicit page guard (page is outside panel layout); real owner event list |
| Payment service | Required organizer ID supplied by guarded caller | Ownership subquery in all counts, aggregates and rows; optional event/search filters narrow scope |
| Buyer tickets, including legacy `/api/demo/tickets` | NextAuth session email | Persisted ticket owner takes precedence, then legacy order/buyer fallback; supplied email ignored |
| Buyer ticket resend | Same current buyer ownership | Owner-scoped SQL before signing/email; unknown and foreign IDs both 404; cancelled tickets denied; only owner receives resend |

Admin mutations also reject cross-origin browser requests (Origin / Sec-Fetch-Site). Existing login, logout, bootstrap and organizer provisioning endpoints have separate legacy mechanisms and are **not** covered by the new operational guard. The proxy remains a cookie-presence navigation shortcut; it must never be relied upon for authorization. Session role comes from its persisted table, not from a client-supplied role.

No hashes or persisted session formats were migrated. Admin session IDs retain the existing generated `admsess_` plus 48 hexadecimal characters. Existing expiry/JOIN checks deny missing/deleted session or principal rows. There is no admin disabled/MFA field in the verified runtime model; adding those requires the identity migration.

M2 closes the QR, wallet, scanner, export, demo mutation and buyer payment-read boundaries listed below. Provisioning and the complete identity/RBAC model remain M3 work. Buyer-email normalization preserves the existing ownership model; stable user IDs and transfer authorization remain future work.

Tests execute real handlers/services/layouts with isolated infrastructure doubles. SQL parameter/predicate contracts are covered; they do not prove PostgreSQL concurrency, persisted expiry or full browser/provider flows. Those need the disposable database integration milestone.

## M2 route and alias inventory

| Surface | Authority and behavior |
| --- | --- |
| `/api/qr`, `/api/demo/qr` | Shared handler; NextAuth session email and current persisted ticket ownership before signing. Optional signed `t` is an identifier, never buyer authentication. Conflicting ticket/event parameters fail. Only VALID tickets can generate QR. |
| `/api/wallet/google/save-url` | Same owner-scoped lookup for `t`, `ticket_id` and `ticketId`. No ID-only fallback. Wallet barcode always uses the existing signed `tc1` format; no `TICKET:id` barcode. No original buyer name or email in the pass. |
| `/organizador/eventos/[id]/scanner` | Approved, verified persisted organizer session plus `events JOIN organizer_events`. Real database event title/slug/location; no fixture event lookup. |
| `/api/scanner/checkin`, `/api/demo/checkin` | Same canonical POST handler; organizer event ownership checked server-side before QR processing. Signed QR must match the event. Explicit manual ticket ID is allowed only after this same authorization; it cannot override an invalid QR. Atomic VALID-to-USED update repeats event and organizer predicates. Duplicates/cancelled/wrong-event/unknown tickets do not enter. No attendee email is returned. |
| `/api/scanner/event-stats`, `/api/scanner/event-checkins` and matching `/api/demo/*` aliases | Persisted organizer/event scope before aggregate or ticket read; owner predicate also in the data query. No global statistics or attendee email in scanner feeds. |
| `/api/scanner/export`, `/api/scanner/export-checkins` and matching `/api/demo/*` aliases | Shared services independently require event ownership, including calls through the old `organizer.pg.server` exports. Filters only narrow scope; no export-secret bypass. CSV quotes cells and neutralizes formula prefixes, including leading whitespace. |
| `/api/demo/reset`, `reset-checkins`, `paid-order`, `cart-hold`, `cart-hold/release`, `stats` | 410, no fixture/database reads or writes. No production paid-ticket simulator or check-in reset handler remains. |
| `/api/dev/seed` | Existing production 403 checked before calling seeder; still a development-only route, not production provisioning. |
| `/api/payments/status`, `/api/payments/stripe/status`, `/api/payments/flow/status` | Session-derived payment owner predicate before provider calls or finalization. Stripe accepts both existing query spellings, `session_id` and `sessionId`, with identical checks. Flow status no longer returns raw provider data. Returned tickets are additionally filtered by current ticket owner, so a previous purchaser cannot recover transferred tickets through an order. |
| `/checkout/[eventId]`, `/checkout/confirm`, legacy `/checkout/success` | Checkout/confirmation require login; success only forwards to the protected confirmation. IDs in callback URLs confer no access. Confirmation data is independently protected in the APIs. |
| `/api/payments/{stripe,transfer,webpay,flow}/create` | Buyer login and same-origin browser check before domain work. `owner_email` is set from the session; a supplied `ownerEmail` is ignored. Existing Stripe/transfer payment retries lock and validate owner/provider; conflict updates cannot overwrite ownership or purchase fields. Webpay creates only new holds/payments. |
| `/api/payments/flow/kick`, `/api/payments/flow/return` | Form POST from provider only performs a 303 navigation. GET requires buyer login and owned stored token before confirmation navigation. JSON kick requires session, same origin and matching payment/token ownership before reconciliation. |
| Flow `/confirm`, `/webhook` | One callback handler for both aliases/methods. Optional supplied signature must validate. Callback without browser session is allowed only after an independent authenticated Flow status call matches stored provider token, commerce order, amount and currency. Responses contain no payment/ticket/PII payload. |
| Webpay `/return` GET/POST | Stored provider token must match independently committed provider response: buy order, hold session, amount, CLP currency and approved status. Browser cancellation fields/order IDs alone perform navigation and never cancel a stored payment. Responses redirect to buyer-protected confirmation. |

All new buyer/scanner JSON and QR responses use `private, no-store`; CSV is also private/non-cacheable. New mutation guards reject cross-site browser Origin/Fetch-Metadata. Unknown authorization/storage errors return generic failures without raw SQL/provider details.

## Scanner grant policy

The current persisted model has organizer ownership, not staff assignments. **M2 admits only the approved organizer who owns the event.** Other organizers, buyer/admin sessions, fabricated organizer cookies, client role claims and simple event codes do not grant scanner access. There is no unrestricted event-code authentication and no implicit global admin scanner override. Staff support must first introduce persisted event grants and action permissions (schema/RBAC foundation M3, operational staff workflow M8). It must reuse the server boundary, not relax it in the UI.

The scanner write repeats owner scope in the SQL to close event-reassignment races. Persistent check-in actor/audit metadata and real concurrent PostgreSQL verification are still pending; M2 does not claim either.

## QR and email authority

The existing HMAC-SHA256 `tc1` signer and timing-safe verification remain unchanged. Buyer QR/wallet reads require ownership in addition to a valid signature. Scanner validation requires authorized event operation plus signature/event/ticket state. Already-issued QR tokens are not rotated or revoked by an ownership transfer in this milestone; a transfer/key-rotation design remains future work.

Payment email paths no longer fetch a public QR URL, use request-derived hosts or forward cookies. `deliverPaidOrder` requires persisted PAID evidence for the order, claims only VALID tickets, rereads the current owner and renders each QR locally. It sends only to that owner. The original buyer/contact does not receive a credential after an ownership change. Missing legacy email columns skip automatic delivery; resend remains available to the owner. The claim-before-send mechanism is not a durable outbox and still has crash/retry limitations for M4.

New checkout requires login even when the provider browser return has no cookie. The form return redirects to a same-site GET so the session can be restored. Legacy guest orders are accessible only after login with their persisted owner email (buyer email fallback only when owner is blank). Checkout copy now distinguishes contact email from entry ownership/delivery. Organizer payment UI refreshes its scoped list; it no longer attempts buyer-only confirmation or reconciliation shortcuts.

## Remaining exposures and validation limits

- Legacy bootstrap/provisioning, recovery, login abuse controls, MFA, durable principal IDs and session revocation need M3. Email-based ownership is retained, not a completed identity migration.
- Public inventory holds still lack the complete ownership/abuse/quota model. Hold expiry, publication rules, concurrency and payment finalization need M4; M2 does not certify financial invariants.
- Stripe and Fintoc webhook implementations retain their existing provider-signature requirements and are not buyer-read aliases. Consistent amount/currency/reference binding across those legacy callbacks, Fintoc replay-window checks, provider availability, transfer configuration and payment idempotency remain M4 review items. No unsigned callback path was added.
- Export volume limits, abuse limits, staff grants and persistent audit trails remain to implement. Old demo libraries remain in the repository but no retired handler imports their mutation functions.
- No real database, provider sandbox, email delivery, Wallet account or browser session was exercised. Tests cover executed handlers/services and SQL contracts with explicit infrastructure doubles; the test loader blocks unmocked database/payment/email SDKs. No production credentials/data/deployment were used.

Provider field checks were compared with the official [Flow API](https://developers.flow.cl/api) and [Webpay Plus documentation](https://transbankdevelopers.com/documentacion/webpay-plus). This was documentation browsing, not a payment-provider API call.
