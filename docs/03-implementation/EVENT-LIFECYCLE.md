# Organizer event lifecycle — M6

M6 builds on M1–M5. This is an application contract tested on disposable local PostgreSQL databases, not authorization to migrate or operate production.

## Authority and architecture

`src/lib/organizer/events.server.ts` owns creation, reads, validated saves and transitions. Thin `/api/organizer/events` and `/api/organizer/events/:id` handlers enforce same-origin writes and bounded bodies. Every operation resolves live M3 identity. IDs, client roles, revision numbers, preview URLs and proposal output are never authorization.

Creation requires tenant-wide `event.edit`; event-scoped staff cannot create arbitrary tenant events. Reads enumerate only events for which the current identity has a capability. Each Event Center section independently requires its capability. All mutations repeat event authorization in the transaction. No staff role gains publication, cancellation or staff administration authority. These actions require the verified, approved, active tenant owner. Disabling the tenant or revoking staff removes access through M3.

The shell admits real owner and buyer-staff sessions. Its proxy exception is limited to exact new panel page shapes and the already guarded scanner page. Legacy organizer APIs and payments retain their preliminary gates. The proxy is never the server authorization authority.

## States and transitions

| From | Authorized targets | Meaning |
| --- | --- | --- |
| DRAFT | IN_REVIEW | Private, incomplete fields allowed; successful checklist and owner confirmation start review |
| IN_REVIEW | DRAFT, PUBLISHED | Review of the saved revision; any editor save returns to DRAFT |
| PUBLISHED | PAUSED, ENDED, CANCELLED | Public or unlisted according to visibility; active public tiers sell within their windows |
| PAUSED | PUBLISHED, ENDED, CANCELLED | Hidden from public readers; new holds/new payment attempts blocked; resume revalidates checklist |
| ENDED | None | Owner may end only after the stored end time; no editing, new sales or scanner admission |
| CANCELLED | None | Terminal cancellation with operational follow-up, no automatic refund |

`IN_REVIEW` represents the owner's review of a version; it does not claim platform moderation approval or an approval SLA. M3 organizer verification/approval remains mandatory. The prototypes' pre-verification creation path has not replaced that identity policy.

Every transition requires an exact revision and explicit confirmation. Cancellation additionally requires typing `CANCELAR <event-id>`. The server does not infer confirmation from opening a screen, supplying an ID, an AI response or pressing an unrelated button. DRAFT cannot jump directly to PUBLISHED.

The legacy `is_published` field remains a compatibility projection: a SQL check requires it to equal `lifecycle='PUBLISHED'`. Migration maps existing boolean values without publishing additional events. A trigger initializes lifecycle on legacy INSERT only; a legacy boolean UPDATE cannot change publication independently. Old admin approve/publish/unpublish mutations authenticate then return 410, and the old organizer submission mutation returns 410 after authentication. Admin moderation workflow and migration of pending legacy submissions remain M9 work. No stored submission is deleted or automatically converted.

## Publication requirements

The shared checklist uses saved domain data: title, configured category, description, future start and later end, venue/address/city/region, main media, positive total capacity, at least one active visible positive-price tier with available inventory and a valid remaining sales window, and confirmed age/access information. Tenant verification/approval is checked through the live policy. Publication does not invent an address, legal restriction, approval deadline, fee or refund policy.

Visibility `UNLISTED` removes an event from catalog/facets but permits its published detail URL. This is discoverability, not private-event authentication. A private/inactive tier cannot be purchased through any hold alias. Private invitation sales and zero-price complimentary issuance are unavailable until M8; a draft can describe them without activating an unsupported checkout flow.

## Drafts and inventory edits

- Every save compares `revision` under the event row lock and increments it once. Concurrent tabs cannot overwrite each other. The editor reports pending/saving/saved/error, retries network failures, blocks conflict retries until reload, warns before leaving dirty content and pauses price autosave until explicit confirmation.
- Dates persist as absolute timestamptz values with an IANA event timezone. Browser datetime selectors explicitly use the device timezone; public detail/preview display the stored event timezone. DST/browser timezone conversion is not silently presented as a venue-local editor.
- Drafts support up to 50 arbitrary named tiers, each with description, integer CLP price, capacity, sales start/end, per-order limit 1–10, visibility and active state. Bodies are bounded to 128 KiB for event edits; the default security-form limit remains 16 KiB.
- Tier capacities sum to at most the event capacity. A tier cannot fall below sold + held. Existing tiers cannot be removed; deactivate them to preserve references and history. Prices, quantities, identifiers, duplicate IDs, windows and configured category are validated on the server.
- Saves and transitions use the same advisory lock `7319322` as M4 holds/finalization/expiry. Holds validate tier visibility/activity/windows and event start. There are no provider calls under this lock.
- With sold units, changes to existing prices require `confirmPrices=true`. Existing hold-item snapshots and order/ticket/payment history are untouched. Current sales aggregates use paid evidence and historical hold prices, not today's tier prices.
- Date/end, location and age changes with sold or reserved units are rejected for operational review. Capacity changes still must cover all committed inventory. Editing a published event cannot remove required publication information; pause before incomplete edits.

The editor uploads binary images through M5. New references require tenant ownership and, for an event-bound object, authority over its source event. Unchanged legacy bytes remain stored intact; private preview uses `/api/event-preview-media/:id/:slot`, with live event-read scope and normalized raster output. Base64 is never sent in editor/preview props. The production object adapter remains unavailable; this milestone does not silently enable local disk storage in production.

## Pause, end and cancellation effects

Pause hides public event/media readers and blocks new reservations. Already persisted payment attempts may finish against their original unexpired reservation; pausing does not revoke purchased tickets. A standalone hold without an existing payment cannot start a new payment while paused. Resume uses the current checklist, revision and owner confirmation.

Ending releases remaining active holds, closes scanner admission and preserves historical tickets. Cancellation also releases active holds once, changes unused VALID tickets to CANCELLED, and preserves USED history. Existing mail/QR/Wallet owner/state checks reject cancelled credentials. Check-in shares the inventory lock and rejects ENDED/CANCELLED events, including its demo alias. A paid callback after a released reservation records PAID + REVIEW through M4 and issues no ticket. Neither transition claims a provider charge was cancelled or refunded.

Cancellation sets durable `cancellation_followup=REVIEW_REQUIRED`, displayed in the Event Center. Operators must separately review affected payments, refunds and communications using approved future procedures. No automatic refund, bulk email or bank operation exists. Used tickets, orders and evidence are not deleted. Already committed actions retain normal transaction semantics; no retroactive reversal is claimed.

## Event Center data and AI

Overview, editor, inventory, checklist/settings and private preview share the canonical event. Sales/analytics require `finance.read` and show verified gross, order count, payment states/methods, historical tier performance and up to 60 active days. They do not fabricate net income, conversion, taxes, settlements or causal explanations. Attendees require `attendees.read`; bounded search/status pagination exposes holder and buyer details without financial fields or QR. CSV uses unchanged M2 event/export authority and formula protection. Staff controls reuse real M3 invite/update/revoke services; invitations default to this event, existing membership updates explicitly preserve their scope, and revocation warns when it affects the membership's other events. Access metrics/scanner require `scanner.read`/`scanner.checkin` respectively.

AI entry and review are implemented as an event-scoped proposal surface. Production returns explicit unavailable until M7's provider integration. An explicitly enabled nonproduction `ORGANIZER_AI_ADAPTER=local` extracts only quoted titles, recognized supplied cities, event kind and explicit quantities/prices. It is labeled **local rules, not a model response**. No prompt is persisted or sent externally. The review shows current/proposed editable values, per-field acceptance, missing fields and warnings. It appends selected proposed tiers inactive with zero inventory and requires explicit sensitive-field confirmation. Apply goes through the same validated revision-aware save; it cannot transition lifecycle. Reject changes nothing. No global assistant, automatic publication, price change, promotion activation, communications or money movement exists.

## Audit, migration and limits

Creation, content/tier/price/capacity changes and every transition are audited transactionally. M3 staff changes and M5 media writes retain their audits. Reads/autosave status polling do not create audit entries. Audit metadata excludes descriptions, email lists and arbitrary request content.

Append-only migration `0006_event_lifecycle.sql` adds lifecycle/projection constraints, revision, event operational fields, nullable draft dates, capacity, cancellation follow-up and tier windows/status. It derives only existing publication state and summed tier capacity; it does not infer missing venues/categories/end times/legal details. Existing inventory and sales are not rewritten. Production catalog reconciliation/rehearsal and restricted DB grants remain mandatory before any rollout.

Known limits: organizer list/dashboard are explicitly bounded to 200 authorized events; attendee pages to 50; CSV is still an in-memory export without M8 volume/streaming controls. Legacy event critical corrections with sales require a reviewed operator workflow. End state requires an explicit owner action; no scheduler is installed. Promotions, complimentary tickets, operational ticket actions and bulk communications are M8; provider AI is M7; admin moderation/refunds/settlements are M9. Production storage, workers, provider certification, key management, safe transfer, approved legal/customer operations and broader device/accessibility/load testing remain prior documented gates.
