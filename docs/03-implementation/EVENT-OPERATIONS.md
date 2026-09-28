# Event operations — M8

Current release status (M10): see [RELEASE-READINESS.md](RELEASE-READINESS.md) and [M10-AUDIT.md](M10-AUDIT.md). Milestone-specific test counts and handoffs below are historical. No production release is certified.

This document describes implemented behavior, not final commercial policy. It supplements M3 authorization, M4 payments, M6 lifecycle and M7 AI. All verification used synthetic local data. No production migration, provider call, email or deployment occurred.

## Staff and event scope

The owner manages members, invitations, revocation, token rotation/resend, roles, individual capabilities and event assignments. The UI starts invitations with the current event and door permissions. An explicit “all organization, including future events” choice persists `event_ids = NULL`; a selected nonempty array grants only those events. Membership by itself grants nothing. The server validates every event against the organizer, rejects permissions outside the role ceiling and checks live identity/tenant/grant state on requests.

Manager ceilings add `courtesy.issue`, `courtesy.revoke`, `promotions.manage` and `attendees.resend`. Support adds only `attendees.resend`; finance and door ceilings are unchanged. These new permissions are **opt-in**, excluded from omitted-capability defaults, and existing grants/invitations are not expanded. Support cannot issue courtesy tickets, manage promotions or read finance. Managers cannot acquire finance or staff administration by changing client labels. Resending rotates the invitation token and expiration, invalidating previous links/codes without reviving accepted/revoked invitations. Delivery uses the encrypted M3 outbox imported by the M4 worker.

## Attendees and export

Event Center supports escaped text search (holder/name/order/ticket), tier, VALID/USED/CANCELLED status, purchase dates (date-only bounds include the full UTC day), 50-row pages and detail. It shows operational buyer/holder contact, order reference, tier, issuance/check-in time and gate/device. It does not expose QR, identity secrets, billing address, RUT, phone or bank information. Payment status/amount and payment filtering require `finance.read`; amounts are per order, not per ticket. Support/manager can read attendees only with the persisted permission. Optional `attendees.resend` queues only a currently VALID ticket to its current owner; callers cannot redirect delivery.

All scanner/demo HTTP CSV aliases use `attendees.export` and the same event-scoped streaming implementation. It fetches at most 500 rows per keyset page, repeats live SQL authorization, honors backpressure/cancellation, and holds no connection between pages. The creation-time watermark excludes new emissions after export starts; fields may still change during export, so this is an operational read, not a financial point-in-time snapshot. Revocation prevents further authorized page queries; already transmitted/in-flight data cannot be recalled. Header and cells are formula-safe. Export contains ticket/tier, current holder email, status, created/used time and order reference, with no buyer name, payment data or QR. UI downloads apply status/tier/dates; free-text and payment filters are explicitly not applied to the CSV. Legacy internal string helpers remain authorized and reject more than 5,000 rows. Search is bounded; very large installations should measure substring-search and pagination plans before adopting a dedicated search index or queued export.

## Complimentary tickets

`courtesy.issue` requires explicit recipient/tier/quantity confirmation and a request UUID. Issuance accepts published/paused future events and 1–10 tickets per operation. It consumes the selected tier's available `capacity - sold - held` under the existing M4 inventory lock. A private inactive tier can be a dedicated courtesy allocation; no quota or extra capacity is invented. Sold/issued stock includes courtesies; verified payment revenue does not.

The transaction writes a consumed zero-price hold snapshot, order, issuance metadata (actor, reason, request fingerprint), VALID tickets, durable mail jobs and audit. It never creates a fake PAID payment. Same-actor identical retries return the same order; changing the body under the same request key fails. Delivery failure cannot roll back an issued ticket. Buyer ticket/QR/wallet access retains current-owner authorization; email workers additionally require a paid order or the explicit courtesy record.

`courtesy.revoke` cancels only an unused courtesy ticket with a reason and audit. It preserves consumed capacity, original issuance and recipient history; automatic resale/reallocation is pending approved policy. USED/paid tickets cannot be revoked through this operation. Issuance and revocation rows are append-only at database level. No bulk messaging, arbitrary recipient override or door issuance exists.

## Promotions and authoritative checkout

`promotions.manage` creates an event-specific code in an inactive state, then explicitly activates/deactivates it. Codes are normalized uppercase, 3–32 alphanumeric/underscore/hyphen characters and unique per event. Percent is integer 1–99; fixed CLP is integer 1–100,000,000 per eligible ticket. Windows, tier references and usage limits (1–1,000,000 purchases) are validated server-side. Empty tier scope includes all tiers. Terms are immutable: create a replacement code when changing them. State changes are audited. This preserves historical attribution and prevents a promotion from silently changing underneath a reservation.

Explicit conservative default: **one code per purchase, no stacking**. Percent discounts round down per ticket; fixed discounts apply per ticket; the paid checkout preserves a minimum of 1 CLP per ticket. Free admissions use the courtesy workflow. No tax, fee, refund or campaign commercial policy is inferred. The existing configured M4 fee policy remains authoritative.

The buyer submits a code and optionally the displayed expected total. `/api/promotions/quote` requires a verified buyer and same-origin request, calculates canonical currently available prices, and does not reserve usage. The actual payment transaction revalidates code/event/tier/window/usage under the inventory lock, snapshots original and discounted unit prices and writes one reservation per hold. Client discounts and totals never determine the charged amount; a mismatched expected amount rejects before payment creation. Request hashes include a supplied promotion code while preserving old no-code idempotency hashes.

Usage counts CONSUMED holds plus ACTIVE unexpired holds. Concurrent buyers cannot exceed the limit. Retry of a persisted purchase does not consume twice. Expiry/release removes the reservation from available usage without deleting historical records. A successful payment consumes the existing discounted snapshot; subsequent deactivation/window expiry does not alter an already reserved payment. A consumed usage is not automatically restored by cancellation/refund. Paid-after-expiry behavior remains M4 REVIEW, not unauthorized ticket issuance. Promotion reservation history is append-only.

AI can suggest copy/concepts, with no activation authority or promotion terms in its allowed patch schema. The organizer separately enters/reviews/executes the normal domain operation.

## Scanner and check-in

`/scanner` resolves real current/upcoming events (up to 200) with live `scanner.read` scope. `/scanner/:id` and all canonical/compatibility reads remain authorized. Check-in needs `scanner.checkin`, same-origin, bounded input and current event scope again in the atomic VALID→USED write. Signed `tc1` QR verification is unchanged. Invalid signatures cannot fall back to a simultaneously supplied manual ID. A valid signature for another event reports WRONG_EVENT without reading that event's ticket. Knowing an ID is never authority.

Exact ticket-code lookup returns only ID/tier/status/used time within the assigned event. It gives door users no name/email/order search. Manual admission still uses the canonical authorized check-in transaction. The operator can configure enabled access, absolute entry-start time and up to 12 gate labels with `event.edit`; terminal events always reject new entry. Empty start/gate configuration preserves existing access behavior. Device labels are optional operator annotations, **not trusted device identity or authentication**.

Successful check-in writes one unique ticket/actor/method/gate/device record atomically with ticket status and the retained M3 audit event. Duplicate concurrent scans cannot both succeed. New history rows are append-only. Existing successful scans remain visible from tickets even without new metadata. Recent history contains the last 20 successful admissions with no buyer PII. Invalid attempts are shown immediately; raw QR/PII are not stored in recent history. Existing M3 audit is retained for compatibility; it can be reviewed for volume retention later.

The camera explicitly requests permission, reports denied/missing/device errors, stops tracks on exit, throttles repeated detections and pauses after a result until “next ticket.” It shows valid/used/invalid/wrong-event/cancelled/unknown/unauthorized/network/server results and server-backed counts. Online-only is explicit: no offline queue or admission guarantee. After a lost response, query/rescan online to establish authoritative status. The actual ticket states are VALID/USED/CANCELLED. Refund, transfer/re-keying and check-in reversal workflows are not implemented; no reversal endpoint or automatic door permission was introduced.

## Operational limits and release prerequisites

Rates use M3 storage: check-in 600 attempts per actor/event/minute, lookup/search 120 per actor/minute, coupon quote/checkout 30 per buyer/minute, courtesy/promotion/configuration changes 60 per actor/hour, resend 30 per actor/hour; exports additionally 12 per actor/hour and the existing event-export burst guard. These are technical defaults to measure in authorized load rehearsals, not throughput guarantees. Inventory/checkout/check-in share the existing global transaction lock: correctness is tested, but large multi-event throughput needs measurement before a narrower locking design.

Migration `0008_event_operations.sql` adds operations tables/indexes and role ceilings without editing 0001–0007 or rewriting historical tickets/payments. Rehearse actual catalog/grant/index compatibility before a separately authorized release. Production workers/delivery, media storage, providers, QR rotation/transfer, runtime DB grants, data retention, physical cameras, other browsers and formal accessibility/load certification remain prior or future release requirements. M9 covers authorized audited admin operations, finance/refunds/settlements and support; unresolved policies remain explicit.


## M9 financial access effects

Scanner check-in now excludes orders with PROCESSING, UNKNOWN or COMPLETED refunds inside the atomic authorized write. The global inventory lock orders refund execution claims against check-in. Refund requests/approvals alone do not disable admission; authoritative completion cancels only mapped still-valid tickets. Automatic refund-based stock restoration, used-ticket reversal and offline access remain unavailable. Organizer event navigation includes scoped Liquidaciones under `finance.read`, showing actual gross/refund/commission/adjustment/net snapshots and settlement history. Internal support/admin notes are never included.


## M11 transfer-aware event operations

[TICKET-TRANSFER.md](TICKET-TRANSFER.md) supersedes the historical M8 transfer limitation. Door authority remains live scanner.checkin for the assigned event. The signed credential generation must match the database ticket in the atomic write; stale screenshots/Wallet barcodes report INVALID_QR. Manual staff admission retains its separate authorized operation and operational holder-verification responsibility. No event code, ticket ID or transfer link is scanner authentication.

Transfer, check-in, event/courtesy cancellation and refunds share inventory lock ordering. Check-in first blocks acceptance; acceptance first revokes the previous QR. Refund request blocks new transfer; confirmed refund cancels the current owner's mapped ticket while the payment remains owned by the original payer. Complimentary transfers require explicit event permission and retain original issuance metadata. Event.edit can explicitly configure the transfer policy/disabled tiers through the bounded audited API; missing configuration and unsupported charged/nominative rules fail closed. No event defaults, deadlines, fees, counts, age or courtesy policy were approved.
# M12 media operations addendum

Create the private draft before uploading poster/desktop/mobile images. Uploads are
event-scoped; save still requires current revision and live event-edit capability.
The editor reports transfer progress, processing, loaded/saved state, decode/network
errors, retry, replace and remove using existing 1D controls. A replacement is
verified first; save failure leaves the current event image unchanged. Reloading a
revision conflict restores the database version. Removing a field only saves the
reference change; it never directly deletes bytes. Publication requires no re-upload.

Admin review shows current assets through its own persisted capability, without
storage browsing or new admin image mutations. Cancellation/end retains media.
Cleanup and legacy adoption use bounded internal workers, documented in
[MEDIA-ARCHITECTURE.md](MEDIA-ARCHITECTURE.md). Undefined legal retention is not
inferred from cancellation, a removed form preview or an orphan grace period.
