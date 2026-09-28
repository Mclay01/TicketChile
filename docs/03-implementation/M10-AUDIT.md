# M10 completion audit

This audit concerns the current implementation, not permission to release. [Release readiness](RELEASE-READINESS.md) owns the remaining external gates. Evidence is stored separately under `qa/m10/`; approved HTML files are unchanged.

## State inventory

| Surface | Reviewed states and recovery |
|---|---|
| Home, catalog, search, category | Server loading boundary, bounded cards/filter results, empty search/category, unavailable-data boundary with retry/navigation; selected filters and pagination retained |
| Event detail / selection | Unknown/unpublished event denied safely; availability loading/failure, sold-out and disabled controls, quantity limits and total; keyboard-operable quantity buttons |
| Checkout / confirmation | Persistent customer labels, invalid/disabled input and provider-unavailable state; account ownership; loading, pending, paid/issued, failure and explicit retry; no extra poll after initial terminal response; generic missing-purchase recovery |
| Sign-in, signup, recovery, organizer registration | Visible login labels, associated registration heading, 12-character password instruction, busy/disabled submission and announced errors; MFA and recovery use server decisions |
| Account, tickets, ticket detail, purchases | Owned records only, empty lists, status, missing/foreign detail unavailable, QR/Wallet/resend availability; no guest authorization by identifier |
| Help, contact, legal | Real navigation and unavailable-service explanation; legal/business content remains visibly pending approval, no invented legal guarantees |
| AI simulator / contextual editor | Unavailable provider, generation/busy, schema/provider/network failure, explicit retry, editable proposal, rejected/applied state, stale revision and sensitive-field confirmation; manual editing remains available |
| Organizer dashboard / event list | Bounded owned/assigned events, empty organization, capability-based links and unavailable boundary |
| Create / editor / preview / checklist | Draft, pending edits, saving/saved, upload failure, conflict/reload, preview without mutation, incomplete publication checks and explicit transition confirmation |
| Event Center entries, sales, finance, analytics | Real aggregate/empty states, scoped reads, unavailable financial history and no invented revenue/commission; query caps retained |
| Attendees, promotions, courtesy, staff | Search/filter/empty, validation, forbidden, request conflict/idempotent retry, invitation pending/accepted/revoked and current permissions; streamed authorized exports |
| Access / scanner | Assigned events, idle/requesting camera, denied/absent device, valid/used/invalid/wrong event/cancelled, unauthorized, offline/network uncertainty and manual lookup; no offline admission; result focus/status announcements |
| Admin dashboard, organizers, verification, events, moderation | MFA/capability gate, real work queues, empty/filter state, decision confirmation, revision conflict, safe missing detail, generic error recovery |
| Admin orders/payments/refunds/settlements/support/reports/audit | Exact sensitive lookup, bounded lists/cards, unavailable provider, explicit reason/confirmation, busy/success/error, idempotency, UNKNOWN/review and external-payout evidence; limited admins cannot invoke hidden operations |

Decorative success screens were not added. Provider configuration/certification and physical-device failure states cannot be certified by a local fixture. Retired demo mutations still return their explicit unavailable response; development fixtures remain separate from production authorization.

## Accessibility and responsive review

- All five target widths are exercised by the M10 browser harness: 390, 430, 768, 1024, 1440. DOM checks cover horizontal overflow, headings, visible form labels, image alternatives and named buttons. Operational sections retain mobile cards/key-value rows rather than forcing desktop tables.
- The keyboard audit exercises native activation, dialog tab cycling, Escape and return focus. Explicit wrapping fixes a last-control escape found during QA. Existing skip link, semantic route landmarks, native forms/selects and quantity controls are retained.
- Checkout placeholder-only inputs now have persistent labels; login errors are announced and associated with the form. Field hints/errors now have unique `aria-describedby` associations and invalid state. Registration focuses its current step heading and correctly describes the server's password minimum.
- Scanner result focus/status, AI generation/apply, editor autosave, financial confirmations and busy/disabled states were reviewed. Existing reduced-motion CSS disables nonessential animation/transitions; mobile buttons and standalone inputs now have a 44px minimum height.
- Token contrast measurements are in `performance-report.json`: primary white text, muted surface text, accent text and warning text. Disabled controls and text over arbitrary event artwork still require content/device review. This is not a full screen-reader, zoom/reflow, axe or WCAG certification; no axe package was installed or certification claimed.
- Error recovery now provides a heading, retry and section navigation at public/organizer/admin/root boundaries, including a self-contained root failure page. Unknown admin detail maps to safe not-found behavior. Section dispatch checks own keys, preventing inherited object names from being mistaken for routes.

## Performance findings

- Before: 37 production JS chunks, 1,319,923 bytes total / 402,069 bytes independently gzipped. The current measured whole-build total is in `performance-report.json`; it increases slightly with error recovery and field associations. **No overall bundle reduction is claimed.**
- The largest QR decoder chunk (437,028 bytes, 115,234 gzip in the measured build) is dynamically imported only when the operator opens the camera. Browser resource verification records deferred loading separately; chunk sums are not per-route transfer sizes.
- Scanner metrics refresh remains 15 seconds but skips hidden/offline tabs and overlapping requests. Confirmation remains bounded to its existing timeout, stops on initial issued/failed/cancelled response, and aborts initial status work when unmounted.
- `query-report.json` uses 20 synthetic events and 10,000 tickets. Catalog page/count execute two queries; there is no client-side query per card. Measured SQL execution: catalog page 0.540 ms, count 0.044 ms, scanner aggregate 0.782 ms, recent check-ins 11.839 ms, scoped 500-row export batch 26.737 ms. Local warm-cache fixture timings are not production latency/SLO/load evidence. Existing indexes retained; no speculative migration.
- Catalog page size 12, attendee/admin pages 50 with a lookahead row, recent scanner rows 20, and organizer event picker/list cap 200 remain bounded. Very large organizer portfolios need a future paginated picker rather than silently increasing that cap. Admin related-detail lists have explicit limits; aggregate queries may still scan large datasets and need staging load measurement.
- Canonical CSV export streams 500-row batches with an authorization check on each batch and a snapshot ceiling/watermark. Compatibility export rejects over 5,000 rows. Escaping protects spreadsheet formula interpretation; PII remains capability restricted. Financial exports are bounded and audited.
- Media retains responsive sizes/aspect ratios, loading fallback and limited priority images; local font assets avoid runtime font services. Four distinct font files are referenced (one Manrope asset, three IBM Plex Mono weights). Removing duplicate font-face declarations would not reduce transfers and was not claimed as an optimization.
- Private API responses remain `private, no-store`; authenticated routes stay identity dependent. Public availability is not cached across sales/pause decisions merely to improve synthetic scores. No real-time infrastructure was added.

## Cleanup and operational changes

Verified unused checkout/carousel/ticket/auth/footer/Card/Wallet components, abandoned verification/success clients and the password-in-command-line hash tool were removed. The unused Radix select wrapper and dependency were removed; the lockfile was resolved offline without install scripts. Test-covered legacy boundary helpers and local-only fixtures were retained. No blanket lint-rule suppression was added; the root failure page intentionally uses a full document navigation with a narrowly documented Next-link exception.

ESLint now has an explicit application root and a whole-repository runner including the API placeholder and shared types. Generated builds/local artifacts are excluded, not maintained source. Baseline debt categories were 12 explicit-any errors, one require import, one effect-state error, one render-ref error and one unused-disable warning. See the final progress entry for exact final counts.

Database requests now have bounded connection/statement timeouts. Unexpected API failures emit closed-schema JSON with a response correlation ID; the Next instrumentation hook records uncaught request failures without raw errors, paths, bodies or headers. Existing AI/provider and finance/security audit records remain separate restricted evidence. Public health/readiness output contains no dependency details. The readiness contract and its limitations are documented in [ENVIRONMENT](ENVIRONMENT.md).

Security headers cover CSP/framing/nosniff/referrer/permissions/HSTS. Self camera access and Webpay form origins remain allowed. Inline hydration/styles are explicitly retained; strict nonce CSP, actual HTTPS ingress and enabled-provider compatibility are external release checks. M1–M9 CSRF, input-size, upload, owner/event/capability and idempotency guards are preserved.

## Approved design comparison

| Immutable reference | Comparison |
|---|---|
| `00-TicketChile-1D-FINAL.html` (9 screens) | Dark surfaces, red primary, Manrope/IBM Plex Mono, restrained borders and ticket split retained; focus and touch target changes are functional |
| `01-TicketChile-Fase-1A-Web-Publica.html` (18 screens) | Home/catalog/detail/selection/checkout/confirmation structure compared; current fixture content and provider-unavailable states replace illustrative sales claims |
| `02-TicketChile-Fase-1B-Web-Publica.html` (38 screens) | Account/ticket/history, AI review/loading/error, help/contact/legal states mapped to real capability/configuration decisions |
| `03-TicketChile-Fase-2A-Organizador.html` (8 screens) | Organizer entry/dashboard/list foundations compared; existing operational Event Center extends them. No sample fees, verification or financial claims were treated as policy |

Bundled references were read from their `__bundler/template` markup, not their loading thumbnail. Hashes are recorded in the performance report. Current screenshots are separate from approved artifacts; remaining content, real-device and visual acceptance belongs to the release gate.
